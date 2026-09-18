import {
  BillingGateway,
  GatewayEvent,
  GatewaySubscription,
} from '../../../src/services/billing/domain/BillingGateway';
import { Subscription } from '../../../src/services/billing/domain/entities/Subscription';
import { InvalidWebhookSignatureError } from '../../../src/services/billing/domain/errors/billingErrors';
import { BillingEventRepository } from '../../../src/services/billing/domain/repositories/BillingEventRepository';
import {
  SubscriptionRepository,
  SubscriptionState,
} from '../../../src/services/billing/domain/repositories/SubscriptionRepository';

/** `SubscriptionRepository` em memória — uma linha por tenant, como no banco. */
export class FakeSubscriptionRepository implements SubscriptionRepository {
  private readonly rows = new Map<string, Subscription>();

  async findByTenant(tenantId: string): Promise<Subscription | null> {
    return this.rows.get(tenantId) ?? null;
  }

  async findByCustomerId(stripeCustomerId: string): Promise<Subscription | null> {
    return [...this.rows.values()].find((row) => row.stripeCustomerId === stripeCustomerId) ?? null;
  }

  async createForCustomer(tenantId: string, stripeCustomerId: string): Promise<Subscription> {
    const existing = this.rows.get(tenantId);
    if (existing) return existing;
    const row: Subscription = {
      tenantId,
      stripeCustomerId,
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    };
    this.rows.set(tenantId, row);
    return row;
  }

  async saveState(tenantId: string, state: SubscriptionState): Promise<Subscription> {
    const existing = this.rows.get(tenantId);
    if (!existing) throw new Error(`Sem assinatura para ${tenantId}`);
    const row: Subscription = {
      ...existing,
      stripeSubscriptionId: state.stripeSubscriptionId ?? undefined,
      plan: state.plan ?? undefined,
      status: state.status ?? undefined,
      trialEndsAt: state.trialEndsAt ?? undefined,
      currentPeriodEnd: state.currentPeriodEnd ?? undefined,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      pastDueSince: state.pastDueSince ?? undefined,
      updatedAt: new Date(),
    };
    this.rows.set(tenantId, row);
    return row;
  }

  seed(row: Partial<Subscription> & { tenantId: string; stripeCustomerId: string }): void {
    this.rows.set(row.tenantId, { cancelAtPeriodEnd: false, updatedAt: new Date(), ...row });
  }
}

/** `BillingEventRepository` em memória. */
export class FakeBillingEventRepository implements BillingEventRepository {
  readonly recorded: { stripeEventId: string; type: string; tenantId?: string }[] = [];

  async exists(stripeEventId: string): Promise<boolean> {
    return this.recorded.some((event) => event.stripeEventId === stripeEventId);
  }

  async record(input: { stripeEventId: string; type: string; tenantId?: string }): Promise<void> {
    if (await this.exists(input.stripeEventId)) return;
    this.recorded.push(input);
  }
}

/**
 * `BillingGateway` falso. A assinatura do aviso é "válida" quando o cabeçalho
 * vale `'valid'` — a conferência de verdade é testada em
 * `StripeBillingGateway.test.ts`, com a função real da biblioteca.
 */
export class FakeBillingGateway implements BillingGateway {
  readonly customers: { tenantId: string; name: string }[] = [];
  readonly checkouts: Parameters<BillingGateway['createCheckoutSession']>[0][] = [];
  readonly portals: Parameters<BillingGateway['createPortalSession']>[0][] = [];
  readonly subscriptionLookups: string[] = [];
  /** O que o Stripe devolveria como assinatura atual. */
  subscription: GatewaySubscription | null = null;
  /** O aviso que chega no próximo `parseWebhookEvent`. */
  nextEvent: GatewayEvent = { id: 'evt_1', type: 'invoice.paid', customerId: 'cus_1' };
  /** Faz `findCurrentSubscription` falhar (Stripe fora do ar). */
  failLookup = false;
  /** Ordem das chamadas que mexem em páginas de pagamento. */
  readonly calls: string[] = [];

  async createCustomer(input: { tenantId: string; name: string }): Promise<string> {
    this.customers.push(input);
    return `cus_${this.customers.length}`;
  }

  async createCheckoutSession(
    input: Parameters<BillingGateway['createCheckoutSession']>[0],
  ): Promise<string> {
    this.calls.push('createCheckoutSession');
    this.checkouts.push(input);
    return 'https://checkout.stripe.test/session';
  }

  async expireOpenCheckoutSessions(customerId: string): Promise<void> {
    this.calls.push(`expireOpenCheckoutSessions:${customerId}`);
  }

  async createPortalSession(
    input: Parameters<BillingGateway['createPortalSession']>[0],
  ): Promise<string> {
    this.portals.push(input);
    return 'https://billing.stripe.test/portal';
  }

  async findCurrentSubscription(customerId: string): Promise<GatewaySubscription | null> {
    this.subscriptionLookups.push(customerId);
    if (this.failLookup) throw new Error('Stripe indisponível');
    return this.subscription;
  }

  parseWebhookEvent(_rawBody: Buffer, signature: string | undefined): GatewayEvent {
    if (signature !== 'valid') throw new InvalidWebhookSignatureError();
    return this.nextEvent;
  }
}
