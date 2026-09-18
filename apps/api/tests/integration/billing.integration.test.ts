import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaSubscriptionRepository } from '../../src/services/billing/infrastructure/PrismaSubscriptionRepository';
import { PrismaBillingEventRepository } from '../../src/services/billing/infrastructure/PrismaBillingEventRepository';
import { PrismaTenantRepository } from '../../src/shared/tenant/infrastructure/PrismaTenantRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

jest.setTimeout(30_000);

/**
 * B5, etapa 2 — as garantias da cobrança que moram no BANCO, não no código:
 * uma assinatura por tenant, cada aviso do Stripe registrado uma vez só, o
 * teste grátis marcado uma única vez, e a trilha de avisos sobrevivendo à
 * exclusão do tenant. Um Fake nunca provaria nenhuma delas.
 *
 * Pula (não falha) se o Postgres estiver fora — com aviso visível.
 */
describe('Integração real — cobrança (B5, etapa 2)', () => {
  let prisma: PrismaClient;
  let subscriptions: PrismaSubscriptionRepository;
  let events: PrismaBillingEventRepository;
  let tenants: PrismaTenantRepository;
  let databaseAvailable = true;
  const stamp = Date.now();
  const tenantId = `test-billing-${stamp}`;
  const eventId = `evt_test_${stamp}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste B5' } });
    } catch {
      databaseAvailable = false;
    }
    subscriptions = new PrismaSubscriptionRepository(prisma);
    events = new PrismaBillingEventRepository(prisma);
    tenants = new PrismaTenantRepository(prisma);
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await prisma.billingEvent.deleteMany({ where: { stripeEventId: eventId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  function skipIfDown(): boolean {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da cobrança.');
    }
    return !databaseAvailable;
  }

  it('clique duplo em Assinar: fica o cliente que chegou primeiro', async () => {
    if (skipIfDown()) return;

    await subscriptions.createForCustomer(tenantId, `cus_first_${stamp}`);
    const second = await subscriptions.createForCustomer(tenantId, `cus_second_${stamp}`);

    expect(second.stripeCustomerId).toBe(`cus_first_${stamp}`);
    expect((await subscriptions.findByCustomerId(`cus_first_${stamp}`))?.tenantId).toBe(tenantId);
    expect(await subscriptions.findByCustomerId(`cus_second_${stamp}`)).toBeNull();
  });

  it('saveState grava a situação e limpa com null', async () => {
    if (skipIfDown()) return;

    const trialEnd = new Date('2026-09-19T12:00:00.000Z');
    const saved = await subscriptions.saveState(tenantId, {
      stripeSubscriptionId: `sub_${stamp}`,
      plan: 'broadcast',
      status: 'trialing',
      trialEndsAt: trialEnd,
      currentPeriodEnd: trialEnd,
      cancelAtPeriodEnd: false,
      pastDueSince: null,
    });
    expect(saved).toMatchObject({ plan: 'broadcast', status: 'trialing', trialEndsAt: trialEnd });

    const cleared = await subscriptions.saveState(tenantId, {
      stripeSubscriptionId: null,
      plan: null,
      status: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      pastDueSince: null,
    });
    expect(cleared.plan).toBeUndefined();
    expect(cleared.status).toBeUndefined();
    expect(cleared.stripeSubscriptionId).toBeUndefined();
  });

  it('o mesmo aviso gravado duas vezes vira uma linha só, sem erro', async () => {
    if (skipIfDown()) return;

    await events.record({ stripeEventId: eventId, type: 'invoice.paid', tenantId });
    await events.record({ stripeEventId: eventId, type: 'invoice.paid', tenantId });

    expect(await events.exists(eventId)).toBe(true);
    expect(await prisma.billingEvent.count({ where: { stripeEventId: eventId } })).toBe(1);
  });

  it('o teste grátis é marcado uma vez só — a segunda data não sobrescreve', async () => {
    if (skipIfDown()) return;

    const first = new Date('2026-09-18T10:00:00.000Z');
    await tenants.markTrialUsed(tenantId, first);
    await tenants.markTrialUsed(tenantId, new Date('2026-10-01T10:00:00.000Z'));

    expect((await tenants.findById(tenantId))?.trialUsedAt).toEqual(first);
  });

  it('excluir o tenant apaga a assinatura (cascata) e mantém a trilha de avisos', async () => {
    if (skipIfDown()) return;

    await prisma.tenant.delete({ where: { id: tenantId } });

    expect(await subscriptions.findByTenant(tenantId)).toBeNull();
    expect(await events.exists(eventId)).toBe(true);
  });
});
