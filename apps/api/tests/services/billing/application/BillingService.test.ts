import { BillingService } from '../../../../src/services/billing/application/BillingService';
import { PlanChangeService } from '../../../../src/services/billing/application/PlanChangeService';
import { BillingGraceScheduler } from '../../../../src/services/billing/domain/schedulers/BillingGraceScheduler';
import { GatewaySubscription } from '../../../../src/services/billing/domain/BillingGateway';
import {
  BillingNotConfiguredError,
  InvalidWebhookSignatureError,
  NoBillingAccountError,
  PlanManagedManuallyError,
  SubscriptionAlreadyActiveError,
} from '../../../../src/services/billing/domain/errors/billingErrors';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { TenantPlan } from '../../../../src/shared/tenant/domain/TenantPlan';
import { PlanSource } from '../../../../src/shared/tenant/domain/PlanSource';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeAuditLogRepository } from '../../auth/testDoubles';
import {
  FakeBillingEventRepository,
  FakeBillingGateway,
  FakeSubscriptionRepository,
} from '../fakes';

/**
 * Cobrança pelo Stripe (B5, etapa 2). As três regras que o serviço sustenta:
 * o plano só muda pelo aviso do Stripe; cada aviso termina relendo o estado
 * atual no Stripe (fora de ordem converge); plano manual é intocável.
 */
const NOW = new Date('2026-09-18T15:00:00.000Z');
const catalog = { broadcast: 'price_b', pro: 'price_p', enterprise: 'price_e' };
const PUBLIC_URL = 'https://app.francis.test';

function stripeSub(over: Partial<GatewaySubscription> = {}): GatewaySubscription {
  return {
    id: 'sub_1',
    customerId: 'cus_1',
    priceId: 'price_p',
    status: 'active',
    cancelAtPeriodEnd: false,
    ...over,
  };
}

function build(
  options: {
    enabled?: boolean;
    plan?: TenantPlan;
    planSource?: PlanSource;
    trialUsedAt?: Date;
    withPlanChangeService?: boolean;
    withGraceScheduler?: boolean;
  } = {},
): {
  service: BillingService;
  tenants: FakeTenantRepository;
  subscriptions: FakeSubscriptionRepository;
  events: FakeBillingEventRepository;
  gateway: FakeBillingGateway;
  audit: FakeAuditLogRepository;
  planChangeService: { applyIfDowngrade: jest.Mock };
  graceScheduler: { schedule: jest.Mock };
} {
  const tenants = new FakeTenantRepository();
  tenants.seed({
    id: 't1',
    name: 'Loja Um',
    apiKeyHash: null,
    plan: options.plan ?? 'free',
    // Quem assina pelo site é self-service; o fake, sem isso, trataria plano
    // pago como manual (espelha a migration) e o Stripe não mexeria nele.
    planSource: options.planSource ?? 'self_service',
    trialUsedAt: options.trialUsedAt,
  });
  const subscriptions = new FakeSubscriptionRepository();
  const events = new FakeBillingEventRepository();
  const gateway = new FakeBillingGateway();
  const audit = new FakeAuditLogRepository();
  const planChangeService = { applyIfDowngrade: jest.fn().mockResolvedValue(undefined) };
  const graceScheduler = { schedule: jest.fn().mockResolvedValue(undefined) };
  const service = new BillingService(
    subscriptions,
    events,
    tenants,
    new NoopLogger(),
    options.enabled === false ? undefined : { gateway, catalog, publicUrl: PUBLIC_URL },
    audit,
    () => NOW,
    options.withPlanChangeService === false
      ? undefined
      : (planChangeService as unknown as PlanChangeService),
    options.withGraceScheduler === false
      ? undefined
      : (graceScheduler as unknown as BillingGraceScheduler),
  );
  return { service, tenants, subscriptions, events, gateway, audit, planChangeService, graceScheduler };
}

describe('BillingService', () => {
  describe('getStatus', () => {
    it('Grátis sem assinatura: teste disponível, sem assinatura', async () => {
      const { service } = build();

      await expect(service.getStatus('t1')).resolves.toEqual({
        plan: 'free',
        planSource: 'self_service',
        billingEnabled: true,
        trialAvailable: true,
        subscription: null,
      });
    });

    it('cobrança desligada: continua respondendo, com billingEnabled false', async () => {
      const { service } = build({ enabled: false });
      await expect(service.getStatus('t1')).resolves.toMatchObject({ billingEnabled: false });
    });

    it('teste já usado: trialAvailable false', async () => {
      const { service } = build({ trialUsedAt: new Date('2026-01-01') });
      await expect(service.getStatus('t1')).resolves.toMatchObject({ trialAvailable: false });
    });
  });

  describe('createCheckout', () => {
    it('primeira vez: cria o cliente, pede o teste de 1 dia e volta para a aba Plano', async () => {
      const { service, gateway, subscriptions, audit } = build();

      const url = await service.createCheckout('t1', 'pro', { userId: 'owner-1' });

      expect(url).toBe('https://checkout.stripe.test/session');
      expect(gateway.customers).toEqual([{ tenantId: 't1', name: 'Loja Um' }]);
      expect(await subscriptions.findByTenant('t1')).toMatchObject({ stripeCustomerId: 'cus_1' });
      expect(gateway.checkouts[0]).toEqual({
        customerId: 'cus_1',
        tenantId: 't1',
        priceId: 'price_p',
        trialDays: 1,
        successUrl: `${PUBLIC_URL}/settings/plano?checkout=done`,
        cancelUrl: `${PUBLIC_URL}/settings/plano?checkout=canceled`,
      });
      const entries = (await audit.listByTenant('t1', { limit: 10 })).entries;
      expect(entries[0]).toMatchObject({
        action: 'billing.checkout_started',
        actorUserId: 'owner-1',
        metadata: { plan: 'pro', trial: true },
      });
    });

    it('teste já usado: sem teste no checkout', async () => {
      const { service, gateway } = build({ trialUsedAt: new Date('2026-01-01') });

      await service.createCheckout('t1', 'broadcast', {});

      expect(gateway.checkouts[0].trialDays).toBeUndefined();
      expect(gateway.checkouts[0].priceId).toBe('price_b');
    });

    it('cliente que já existe: expira as páginas de pagamento abertas ANTES de criar outra', async () => {
      // Duas abas, duas páginas de pagamento: concluir as duas daria duas
      // assinaturas cobrando. Só a mais nova pode ser concluída.
      const { service, gateway, subscriptions } = build();
      subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1', status: null });

      await service.createCheckout('t1', 'pro', {});

      expect(gateway.calls).toEqual(['expireOpenCheckoutSessions:cus_1', 'createCheckoutSession']);
    });

    it('cliente novo também confere (clique duplo na primeira assinatura cai no mesmo cliente)', async () => {
      const { service, gateway } = build();

      await service.createCheckout('t1', 'pro', {});

      expect(gateway.calls).toEqual(['expireOpenCheckoutSessions:cus_1', 'createCheckoutSession']);
    });

    it('reaproveita o cliente que já existe (cancelou antes e voltou)', async () => {
      const { service, gateway, subscriptions } = build();
      subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_antigo', status: 'canceled' });

      await service.createCheckout('t1', 'pro', {});

      expect(gateway.customers).toHaveLength(0);
      expect(gateway.checkouts[0].customerId).toBe('cus_antigo');
    });

    it.each(['trialing', 'active', 'past_due'] as const)(
      'assinatura %s: recusa (trocar é pelo portal)',
      async (status) => {
        const { service, subscriptions } = build();
        subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1', status });

        await expect(service.createCheckout('t1', 'pro', {})).rejects.toBeInstanceOf(
          SubscriptionAlreadyActiveError,
        );
      },
    );

    it('plano pago ativado pela equipe: recusa', async () => {
      const { service, gateway } = build({ plan: 'pro', planSource: 'manual' });

      await expect(service.createCheckout('t1', 'enterprise', {})).rejects.toBeInstanceOf(
        PlanManagedManuallyError,
      );
      expect(gateway.customers).toHaveLength(0);
    });

    it('cobrança desligada: BillingNotConfiguredError', async () => {
      const { service } = build({ enabled: false });
      await expect(service.createCheckout('t1', 'pro', {})).rejects.toBeInstanceOf(
        BillingNotConfiguredError,
      );
    });
  });

  describe('createPortalSession', () => {
    it('sem cliente no Stripe: NoBillingAccountError', async () => {
      const { service } = build();
      await expect(service.createPortalSession('t1')).rejects.toBeInstanceOf(NoBillingAccountError);
    });

    it('com cliente: abre o portal voltando para a aba Plano', async () => {
      const { service, subscriptions, gateway } = build();
      subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1', status: 'active' });

      await expect(service.createPortalSession('t1')).resolves.toBe(
        'https://billing.stripe.test/portal',
      );
      expect(gateway.portals[0]).toEqual({
        customerId: 'cus_1',
        returnUrl: `${PUBLIC_URL}/settings/plano`,
      });
    });
  });

  describe('handleWebhook', () => {
    function withCustomer(ctx: ReturnType<typeof build>): void {
      ctx.subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
    }

    it('assinatura inválida: recusa e não grava nada', async () => {
      const ctx = build();
      withCustomer(ctx);

      await expect(ctx.service.handleWebhook(Buffer.from('{}'), 'forjada')).rejects.toBeInstanceOf(
        InvalidWebhookSignatureError,
      );
      expect(ctx.events.recorded).toHaveLength(0);
      expect(ctx.gateway.subscriptionLookups).toHaveLength(0);
    });

    it('assinatura em teste do Pro: tenant vira Pro self_service, teste marcado, trilha gravada', async () => {
      const ctx = build();
      withCustomer(ctx);
      ctx.gateway.nextEvent = {
        id: 'evt_created',
        type: 'customer.subscription.created',
        customerId: 'cus_1',
      };
      const trialEnd = new Date('2026-09-19T15:00:00.000Z');
      ctx.gateway.subscription = stripeSub({
        status: 'trialing',
        trialEnd,
        currentPeriodEnd: trialEnd,
      });

      await expect(ctx.service.handleWebhook(Buffer.from('{}'), 'valid')).resolves.toBe(
        'processed',
      );

      expect(await ctx.tenants.findById('t1')).toMatchObject({
        plan: 'pro',
        planSource: 'self_service',
        trialUsedAt: NOW,
      });
      expect(await ctx.subscriptions.findByTenant('t1')).toMatchObject({
        stripeSubscriptionId: 'sub_1',
        plan: 'pro',
        status: 'trialing',
        trialEndsAt: trialEnd,
      });
      expect(ctx.events.recorded).toEqual([
        { stripeEventId: 'evt_created', type: 'customer.subscription.created', tenantId: 't1' },
      ]);
      const entries = (await ctx.audit.listByTenant('t1', { limit: 10 })).entries;
      expect(entries[0]).toMatchObject({
        action: 'billing.plan_changed',
        metadata: { from: 'free', to: 'pro', source: 'stripe' },
      });
    });

    it('o mesmo aviso de novo: duplicate, sem reler o Stripe', async () => {
      const ctx = build();
      withCustomer(ctx);
      ctx.gateway.subscription = stripeSub();

      await ctx.service.handleWebhook(Buffer.from('{}'), 'valid');
      await expect(ctx.service.handleWebhook(Buffer.from('{}'), 'valid')).resolves.toBe(
        'duplicate',
      );
      expect(ctx.gateway.subscriptionLookups).toHaveLength(1);
    });

    it('tipo que não mexe na assinatura: ignored', async () => {
      const ctx = build();
      withCustomer(ctx);
      ctx.gateway.nextEvent = { id: 'evt_x', type: 'charge.succeeded', customerId: 'cus_1' };

      await expect(ctx.service.handleWebhook(Buffer.from('{}'), 'valid')).resolves.toBe('ignored');
      expect(ctx.gateway.subscriptionLookups).toHaveLength(0);
    });

    it('cliente que não é do Francis (outro produto na mesma conta Stripe): ignored, nada muda', async () => {
      const ctx = build();
      withCustomer(ctx);
      ctx.gateway.nextEvent = { id: 'evt_y', type: 'invoice.paid', customerId: 'cus_metaplay' };
      ctx.gateway.subscription = stripeSub({ customerId: 'cus_metaplay' });

      await expect(ctx.service.handleWebhook(Buffer.from('{}'), 'valid')).resolves.toBe('ignored');
      expect((await ctx.tenants.findById('t1'))?.plan).toBe('free');
      expect(ctx.events.recorded).toHaveLength(0);
    });

    it('estado, não evento: invoice.paid atrasado depois do cancelamento deixa o tenant no Grátis', async () => {
      const ctx = build({ plan: 'pro' });
      withCustomer(ctx);
      ctx.gateway.nextEvent = { id: 'evt_old_paid', type: 'invoice.paid', customerId: 'cus_1' };
      ctx.gateway.subscription = stripeSub({ status: 'canceled' });

      await ctx.service.handleWebhook(Buffer.from('{}'), 'valid');

      expect((await ctx.tenants.findById('t1'))?.plan).toBe('free');
      expect((await ctx.subscriptions.findByTenant('t1'))?.status).toBe('canceled');
    });

    it('falha ao reler o Stripe: o erro sobe e o aviso NÃO é registrado (o Stripe reenvia)', async () => {
      const ctx = build();
      withCustomer(ctx);
      ctx.gateway.failLookup = true;

      await expect(ctx.service.handleWebhook(Buffer.from('{}'), 'valid')).rejects.toThrow(
        'Stripe indisponível',
      );
      expect(ctx.events.recorded).toHaveLength(0);
    });
  });

  describe('syncFromStripe', () => {
    it('tenant com plano pago manual: a linha é atualizada, o plano não', async () => {
      const ctx = build({ plan: 'enterprise', planSource: 'manual' });
      ctx.subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
      ctx.gateway.subscription = stripeSub({ status: 'canceled' });

      await ctx.service.syncFromStripe('t1');

      expect(await ctx.tenants.findById('t1')).toMatchObject({
        plan: 'enterprise',
        planSource: 'manual',
      });
      expect((await ctx.subscriptions.findByTenant('t1'))?.status).toBe('canceled');
    });

    it('preço que não está no catálogo: plano mantido', async () => {
      const ctx = build({ plan: 'free' });
      ctx.subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
      ctx.gateway.subscription = stripeSub({ priceId: 'price_desconhecido' });

      await ctx.service.syncFromStripe('t1');

      expect((await ctx.tenants.findById('t1'))?.plan).toBe('free');
    });

    it('sem teste na assinatura: não marca o teste como usado', async () => {
      const ctx = build();
      ctx.subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
      ctx.gateway.subscription = stripeSub({ status: 'active' });

      await ctx.service.syncFromStripe('t1');

      expect((await ctx.tenants.findById('t1'))?.trialUsedAt).toBeUndefined();
      expect((await ctx.tenants.findById('t1'))?.plan).toBe('pro');
    });

    it('atraso: grava quando começou, mantém a data nos avisos seguintes e limpa ao pagar', async () => {
      const ctx = build({ plan: 'pro' });
      const firstSeen = new Date('2026-09-10T00:00:00.000Z');
      ctx.subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
      ctx.gateway.subscription = stripeSub({ status: 'past_due' });

      await ctx.service.syncFromStripe('t1');
      expect((await ctx.subscriptions.findByTenant('t1'))?.pastDueSince).toEqual(NOW);

      ctx.subscriptions.seed({
        tenantId: 't1',
        stripeCustomerId: 'cus_1',
        status: 'past_due',
        pastDueSince: firstSeen,
      });
      await ctx.service.syncFromStripe('t1');
      expect((await ctx.subscriptions.findByTenant('t1'))?.pastDueSince).toEqual(firstSeen);

      ctx.gateway.subscription = stripeSub({ status: 'active' });
      await ctx.service.syncFromStripe('t1');
      expect((await ctx.subscriptions.findByTenant('t1'))?.pastDueSince).toBeUndefined();
      // Em atraso, o plano continua (a tolerância é da etapa 3).
      expect((await ctx.tenants.findById('t1'))?.plan).toBe('pro');
    });

    // B5, etapa 3 — agendamento da tolerância de 3 dias.
    it('primeira vez que fica em atraso: agenda billing-grace para pastDueSince + 3 dias', async () => {
      const ctx = build({ plan: 'pro' });
      ctx.subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
      ctx.gateway.subscription = stripeSub({ id: 'sub_1', status: 'past_due' });

      await ctx.service.syncFromStripe('t1');

      expect(ctx.graceScheduler.schedule).toHaveBeenCalledWith(
        't1',
        'sub_1',
        NOW,
        new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000),
      );
    });

    it('já estava em atraso antes: não agenda de novo', async () => {
      const ctx = build({ plan: 'pro' });
      const firstSeen = new Date('2026-09-10T00:00:00.000Z');
      ctx.subscriptions.seed({
        tenantId: 't1',
        stripeCustomerId: 'cus_1',
        status: 'past_due',
        pastDueSince: firstSeen,
      });
      ctx.gateway.subscription = stripeSub({ id: 'sub_1', status: 'past_due' });

      await ctx.service.syncFromStripe('t1');

      expect(ctx.graceScheduler.schedule).not.toHaveBeenCalled();
    });

    it('voltou a ficar em dia: não agenda nada', async () => {
      const ctx = build({ plan: 'pro' });
      ctx.subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
      ctx.gateway.subscription = stripeSub({ id: 'sub_1', status: 'active' });

      await ctx.service.syncFromStripe('t1');

      expect(ctx.graceScheduler.schedule).not.toHaveBeenCalled();
    });

    it('sem graceScheduler injetado (Redis fora do ar): não lança', async () => {
      const ctx = build({ plan: 'pro', withGraceScheduler: false });
      ctx.subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
      ctx.gateway.subscription = stripeSub({ id: 'sub_1', status: 'past_due' });

      await expect(ctx.service.syncFromStripe('t1')).resolves.toBeUndefined();
    });

    // B5, etapa 3 — a descida de plano é aplicada sempre que o plano muda.
    it('plano mudou (desceu) durante o syncFromStripe: chama planChangeService.applyIfDowngrade(tenantId, from, to)', async () => {
      const ctx = build({ plan: 'enterprise' });
      ctx.subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
      ctx.gateway.subscription = stripeSub({ status: 'canceled' });

      await ctx.service.syncFromStripe('t1');

      expect(ctx.planChangeService.applyIfDowngrade).toHaveBeenCalledWith(
        't1',
        'enterprise',
        'free',
      );
    });

    it('plano mudou (subiu) durante o syncFromStripe: chama planChangeService.applyIfDowngrade mesmo assim', async () => {
      const ctx = build({ plan: 'broadcast' });
      ctx.subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
      ctx.gateway.subscription = stripeSub({ status: 'active', priceId: 'price_e' });

      await ctx.service.syncFromStripe('t1');

      expect(ctx.planChangeService.applyIfDowngrade).toHaveBeenCalledWith(
        't1',
        'broadcast',
        'enterprise',
      );
    });

    it('plano não mudou: não chama planChangeService', async () => {
      const ctx = build({ plan: 'pro' });
      ctx.subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
      ctx.gateway.subscription = stripeSub({ status: 'active', priceId: 'price_p' });

      await ctx.service.syncFromStripe('t1');

      expect(ctx.planChangeService.applyIfDowngrade).not.toHaveBeenCalled();
    });

    it('sem planChangeService injetado: não lança', async () => {
      const ctx = build({ plan: 'enterprise', withPlanChangeService: false });
      ctx.subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
      ctx.gateway.subscription = stripeSub({ status: 'canceled' });

      await expect(ctx.service.syncFromStripe('t1')).resolves.toBeUndefined();
    });
  });
});
