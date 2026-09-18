import express from 'express';
import request from 'supertest';

import { BillingService } from '../../../../src/services/billing/application/BillingService';
import { createBillingRouter } from '../../../../src/services/billing/presentation/billingRouter';
import { createBillingErrorHandler } from '../../../../src/services/billing/presentation/billingErrorHandler';
import { createBillingWebhookRouter } from '../../../../src/services/billing/presentation/billingWebhookRouter';
import { STRIPE_WEBHOOK_PATH } from '../../../../src/services/billing/presentation/webhookPath';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';
import { Principal, RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import {
  FakeBillingEventRepository,
  FakeBillingGateway,
  FakeSubscriptionRepository,
} from '../fakes';

/**
 * Rotas da cobrança (B5, etapa 2). O isolamento entre tenants (o `tenantId`
 * do caminho tem de ser o do crachá) é do `authenticate`, montado antes deste
 * router em `index.ts` — aqui o principal é injetado direto.
 */
const catalog = { broadcast: 'price_b', pro: 'price_p', enterprise: 'price_e' };

function build(
  principal?: Principal,
  options: { enabled?: boolean } = {},
): {
  app: express.Express;
  gateway: FakeBillingGateway;
  subscriptions: FakeSubscriptionRepository;
  events: FakeBillingEventRepository;
  tenants: FakeTenantRepository;
} {
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 't1', name: 'Loja Um', apiKeyHash: null, plan: 'free' });
  const subscriptions = new FakeSubscriptionRepository();
  const events = new FakeBillingEventRepository();
  const gateway = new FakeBillingGateway();
  const service = new BillingService(
    subscriptions,
    events,
    tenants,
    new NoopLogger(),
    options.enabled === false
      ? undefined
      : { gateway, catalog, publicUrl: 'https://app.francis.test' },
  );

  const app = express();
  app.use(STRIPE_WEBHOOK_PATH, createBillingWebhookRouter(service, new NoopLogger()));
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/billing',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createBillingRouter(service),
  );
  app.use('/api/tenants/:tenantId/billing', createBillingErrorHandler(new NoopLogger()));
  return { app, gateway, subscriptions, events, tenants };
}

function person(role: UserRole): Principal {
  return { kind: 'user', userId: `u-${role}`, tenantId: 't1', role };
}

const BASE = '/api/tenants/t1/billing';

describe('billingRouter', () => {
  it('GET: qualquer cargo vê a situação do plano', async () => {
    const { app } = build(person('read_only'));

    const response = await request(app).get(BASE);

    expect(response.status).toBe(200);
    expect(response.body.billing).toEqual({
      plan: 'free',
      planSource: 'self_service',
      billingEnabled: true,
      trialAvailable: true,
      subscription: null,
    });
  });

  it('GET com assinatura: datas em ISO', async () => {
    const { app, subscriptions } = build(person('operator'));
    subscriptions.seed({
      tenantId: 't1',
      stripeCustomerId: 'cus_1',
      status: 'trialing',
      plan: 'pro',
      trialEndsAt: new Date('2026-09-19T15:00:00.000Z'),
    });

    const response = await request(app).get(BASE);

    expect(response.body.billing.subscription).toEqual({
      plan: 'pro',
      status: 'trialing',
      trialEndsAt: '2026-09-19T15:00:00.000Z',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      pastDueSince: null,
    });
  });

  it('checkout pelo dono: devolve a URL do Stripe', async () => {
    const { app, gateway } = build(person('owner'));

    const response = await request(app).post(`${BASE}/checkout`).send({ plan: 'broadcast' });

    expect(response.status).toBe(200);
    expect(response.body.url).toBe('https://checkout.stripe.test/session');
    expect(gateway.checkouts[0].priceId).toBe('price_b');
  });

  it.each(['administrator', 'manager', 'operator', 'read_only'] as const)(
    'checkout por %s: 403 (só o dono paga)',
    async (role) => {
      const { app, gateway } = build(person(role));

      const response = await request(app).post(`${BASE}/checkout`).send({ plan: 'pro' });

      expect(response.status).toBe(403);
      expect(gateway.checkouts).toHaveLength(0);
    },
  );

  it('checkout pela API key: 403 human_required', async () => {
    const { app } = build({ kind: 'machine', tenantId: 't1' });

    const response = await request(app).post(`${BASE}/checkout`).send({ plan: 'pro' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('human_required');
  });

  it('checkout pelo suporte assistido: 403 human_required', async () => {
    const { app } = build({
      kind: 'support',
      tenantId: 't1',
      platformUserId: 'p1',
      supportAccessId: 's1',
    });

    const response = await request(app).post(`${BASE}/portal`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('human_required');
  });

  it.each([{ plan: 'free' }, { plan: 'gold' }, {}])('checkout com plano inválido %j: 400', async (body) => {
    const { app } = build(person('owner'));
    const response = await request(app).post(`${BASE}/checkout`).send(body);
    expect(response.status).toBe(400);
  });

  it('checkout com assinatura valendo: 409 subscription_already_active', async () => {
    const { app, subscriptions } = build(person('owner'));
    subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1', status: 'active' });

    const response = await request(app).post(`${BASE}/checkout`).send({ plan: 'pro' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('subscription_already_active');
  });

  it('cobrança desligada: 503 billing_not_configured', async () => {
    const { app } = build(person('owner'), { enabled: false });

    const response = await request(app).post(`${BASE}/checkout`).send({ plan: 'pro' });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('billing_not_configured');
  });

  it('portal sem assinatura: 409 no_billing_account; com assinatura: URL', async () => {
    const { app, subscriptions } = build(person('owner'));

    expect((await request(app).post(`${BASE}/portal`)).body.error).toBe('no_billing_account');

    subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1', status: 'active' });
    const response = await request(app).post(`${BASE}/portal`);
    expect(response.status).toBe(200);
    expect(response.body.url).toBe('https://billing.stripe.test/portal');
  });
});

describe('billingWebhookRouter', () => {
  function send(app: express.Express, signature?: string): request.Test {
    const req = request(app)
      .post(STRIPE_WEBHOOK_PATH)
      .set('Content-Type', 'application/json')
      .send('{"id":"evt_1"}');
    return signature ? req.set('stripe-signature', signature) : req;
  }

  it('assinatura inválida: 400 e nada gravado', async () => {
    const { app, events } = build();

    const response = await send(app, 'forjada');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_signature');
    expect(events.recorded).toHaveLength(0);
  });

  it('sem cabeçalho de assinatura: 400', async () => {
    const { app } = build();
    expect((await send(app)).status).toBe(400);
  });

  it('aviso válido: 200, plano atualizado; repetido: 200 sem reprocessar', async () => {
    const { app, subscriptions, gateway, tenants } = build();
    subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
    gateway.nextEvent = { id: 'evt_1', type: 'customer.subscription.created', customerId: 'cus_1' };
    gateway.subscription = {
      id: 'sub_1',
      customerId: 'cus_1',
      priceId: 'price_e',
      status: 'active',
      cancelAtPeriodEnd: false,
    };

    const first = await send(app, 'valid');
    const second = await send(app, 'valid');

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true, outcome: 'processed' });
    expect((await tenants.findById('t1'))?.plan).toBe('enterprise');
    expect(second.body.outcome).toBe('duplicate');
    expect(gateway.subscriptionLookups).toHaveLength(1);
  });

  it('o corpo chega CRU ao serviço (o parser JSON não o consumiu)', async () => {
    const { app, gateway } = build();
    const parse = jest.spyOn(gateway, 'parseWebhookEvent');

    await send(app, 'valid');

    const [rawBody] = parse.mock.calls[0];
    expect(Buffer.isBuffer(rawBody)).toBe(true);
    expect(rawBody.toString()).toBe('{"id":"evt_1"}');
  });

  it('falha inesperada: 500 para o Stripe reenviar, e o aviso não é registrado', async () => {
    const { app, subscriptions, gateway, events } = build();
    subscriptions.seed({ tenantId: 't1', stripeCustomerId: 'cus_1' });
    gateway.failLookup = true;

    const response = await send(app, 'valid');

    expect(response.status).toBe(500);
    expect(events.recorded).toHaveLength(0);
  });
});
