import { Logger } from '../../../shared/domain/Logger';
import { PlanSource } from '../../../shared/tenant/domain/PlanSource';
import { Tenant } from '../../../shared/tenant/domain/Tenant';
import { TenantPlan } from '../../../shared/tenant/domain/TenantPlan';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { AuditLogRepository } from '../../auth/domain/repositories/AuditLogRepository';
import { BillingGateway, GatewayEvent } from '../domain/BillingGateway';
import { Subscription, SubscriptionStatus } from '../domain/entities/Subscription';
import {
  BillingNotConfiguredError,
  NoBillingAccountError,
  PlanManagedManuallyError,
  SubscriptionAlreadyActiveError,
} from '../domain/errors/billingErrors';
import { PaidPlan, PriceCatalog, planForPrice, priceForPlan } from '../domain/priceCatalog';
import { BillingEventRepository } from '../domain/repositories/BillingEventRepository';
import { SubscriptionRepository } from '../domain/repositories/SubscriptionRepository';
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  planFromSubscription,
  toSubscriptionStatus,
} from '../domain/subscriptionState';

/** Dias de teste grátis na primeira assinatura (decisão do fundador, B5). */
export const TRIAL_DAYS = 1;

/** Avisos que mexem na assinatura. Os demais respondem 200 e são ignorados. */
const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

export interface BillingConfig {
  gateway: BillingGateway;
  catalog: PriceCatalog;
  /** Endereço público do painel, sem barra no fim — base das URLs de volta. */
  publicUrl: string;
}

export interface BillingStatus {
  plan: TenantPlan;
  planSource: PlanSource;
  billingEnabled: boolean;
  trialAvailable: boolean;
  subscription: null | {
    plan?: TenantPlan;
    status?: SubscriptionStatus;
    trialEndsAt?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd: boolean;
    pastDueSince?: Date;
  };
}

export interface BillingActor {
  userId?: string;
  ip?: string;
  userAgent?: string;
}

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored';

/**
 * Cobrança pelo Stripe (B5, etapa 2). Três regras sustentam tudo:
 *
 * 1. **O plano só muda pelo aviso do Stripe.** Checkout e portal só abrem
 *    páginas do Stripe; quem ativa é `syncFromStripe`, chamado pelo webhook.
 *    A volta do navegador nunca ativa nada.
 * 2. **Estado, não evento.** Todo aviso tratado termina relendo a assinatura
 *    atual no Stripe. Avisos fora de ordem ou repetidos convergem para o
 *    mesmo resultado.
 * 3. **Plano manual é intocável.** Um tenant pago de origem `manual` nunca é
 *    alterado pelo Stripe.
 *
 * `billing` ausente = cobrança desligada (chaves fora do ambiente): só
 * `getStatus` funciona, e o resto do produto segue igual.
 */
export class BillingService {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly events: BillingEventRepository,
    private readonly tenants: TenantRepository,
    private readonly logger: Logger,
    private readonly billing?: BillingConfig,
    private readonly auditLog?: AuditLogRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getStatus(tenantId: string): Promise<BillingStatus> {
    const tenant = await this.requireTenant(tenantId);
    const subscription = await this.subscriptions.findByTenant(tenantId);
    return {
      plan: tenant.plan,
      planSource: tenant.planSource,
      billingEnabled: Boolean(this.billing),
      trialAvailable: !tenant.trialUsedAt,
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            trialEndsAt: subscription.trialEndsAt,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            pastDueSince: subscription.pastDueSince,
          }
        : null,
    };
  }

  async createCheckout(tenantId: string, plan: PaidPlan, actor: BillingActor): Promise<string> {
    const billing = this.requireEnabled();
    const tenant = await this.requireTenant(tenantId);
    if (tenant.planSource === 'manual' && tenant.plan !== 'free') {
      throw new PlanManagedManuallyError();
    }
    const existing = await this.subscriptions.findByTenant(tenantId);
    if (existing && isLive(existing)) {
      throw new SubscriptionAlreadyActiveError();
    }

    const customerId = existing?.stripeCustomerId ?? (await this.createCustomer(billing, tenant));
    // Só a página mais nova pode ser paga: duas abas não viram duas assinaturas.
    // Vale também para o primeiro clique duplo — os dois caem no mesmo cliente
    // (o primeiro a gravar fica), então sempre há o que conferir.
    await billing.gateway.expireOpenCheckoutSessions(customerId);
    const trialDays = tenant.trialUsedAt ? undefined : TRIAL_DAYS;
    const url = await billing.gateway.createCheckoutSession({
      customerId,
      tenantId,
      priceId: priceForPlan(billing.catalog, plan),
      trialDays,
      successUrl: `${billing.publicUrl}/settings/plano?checkout=done`,
      cancelUrl: `${billing.publicUrl}/settings/plano?checkout=canceled`,
    });
    await this.audit(tenantId, actor, 'billing.checkout_started', {
      plan,
      trial: Boolean(trialDays),
    });
    return url;
  }

  async createPortalSession(tenantId: string): Promise<string> {
    const billing = this.requireEnabled();
    await this.requireTenant(tenantId);
    const subscription = await this.subscriptions.findByTenant(tenantId);
    if (!subscription) throw new NoBillingAccountError();
    return billing.gateway.createPortalSession({
      customerId: subscription.stripeCustomerId,
      returnUrl: `${billing.publicUrl}/settings/plano`,
    });
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<WebhookOutcome> {
    const billing = this.requireEnabled();
    const event = billing.gateway.parseWebhookEvent(rawBody, signature);
    if (await this.events.exists(event.id)) return 'duplicate';
    if (!HANDLED_EVENTS.has(event.type)) return 'ignored';

    const tenantId = await this.resolveTenant(event);
    if (!tenantId) {
      // Esta conta Stripe também atende outro produto: aviso de um cliente
      // que não é nosso responde 200 e não mexe em nada.
      this.logger.info('Aviso do Stripe de um cliente que não é do Francis — ignorado', {
        eventId: event.id,
        type: event.type,
      });
      return 'ignored';
    }

    await this.syncFromStripe(tenantId);
    // Só depois do sucesso: se a reconciliação falhar, o Stripe reenvia.
    await this.events.record({ stripeEventId: event.id, type: event.type, tenantId });
    return 'processed';
  }

  /** Relê a assinatura no Stripe e acerta a linha local e o plano do tenant. */
  async syncFromStripe(tenantId: string): Promise<void> {
    const billing = this.requireEnabled();
    const tenant = await this.tenants.findById(tenantId);
    const local = await this.subscriptions.findByTenant(tenantId);
    if (!tenant || !local) return;

    const current = await billing.gateway.findCurrentSubscription(local.stripeCustomerId);
    const status = current ? toSubscriptionStatus(current.status) : null;
    await this.subscriptions.saveState(tenantId, {
      stripeSubscriptionId: current?.id ?? null,
      plan: current?.priceId ? (planForPrice(billing.catalog, current.priceId) ?? null) : null,
      status,
      trialEndsAt: current?.trialEnd ?? null,
      currentPeriodEnd: current?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: current?.cancelAtPeriodEnd ?? false,
      pastDueSince: status === 'past_due' ? (local.pastDueSince ?? this.now()) : null,
    });

    if (tenant.planSource === 'manual' && tenant.plan !== 'free') {
      this.logger.warn('Aviso do Stripe para um tenant de plano manual — plano mantido', {
        tenantId,
      });
      return;
    }

    const target = planFromSubscription(current, billing.catalog);
    if (target === undefined) {
      this.logger.warn('Assinatura com preço fora do catálogo — plano mantido', {
        tenantId,
        priceId: current?.priceId,
      });
      return;
    }

    if (current?.trialEnd && !tenant.trialUsedAt) {
      await this.tenants.markTrialUsed(tenantId, this.now());
    }
    if (target !== tenant.plan) {
      await this.tenants.changePlan(tenantId, target, 'self_service');
      await this.audit(tenantId, {}, 'billing.plan_changed', {
        from: tenant.plan,
        to: target,
        source: 'stripe',
      });
    }
  }

  private async resolveTenant(event: GatewayEvent): Promise<string | undefined> {
    if (!event.customerId) return undefined;
    const subscription = await this.subscriptions.findByCustomerId(event.customerId);
    return subscription?.tenantId;
  }

  private async createCustomer(billing: BillingConfig, tenant: Tenant): Promise<string> {
    const customerId = await billing.gateway.createCustomer({
      tenantId: tenant.id,
      name: tenant.name,
    });
    const saved = await this.subscriptions.createForCustomer(tenant.id, customerId);
    return saved.stripeCustomerId;
  }

  private requireEnabled(): BillingConfig {
    if (!this.billing) throw new BillingNotConfiguredError();
    return this.billing;
  }

  private async requireTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);
    return tenant;
  }

  /** Nunca derruba a ação por falha da trilha (mesma política do resto do projeto). */
  private async audit(
    tenantId: string,
    actor: BillingActor,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!this.auditLog) return;
    try {
      await this.auditLog.record({
        tenantId,
        actorUserId: actor.userId,
        action,
        targetType: 'subscription',
        targetId: tenantId,
        metadata,
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
    } catch (error) {
      this.logger.warn('Falha ao registrar auditoria da cobrança', { tenantId, action, error });
    }
  }
}

function isLive(subscription: Subscription): boolean {
  return Boolean(subscription.status && ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status));
}
