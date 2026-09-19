import { BillingGraceJobProcessor } from '../../../../src/services/billing/infrastructure/BillingGraceJobProcessor';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeSubscriptionRepository, FakeBillingGateway } from '../fakes';

function buildSut() {
  const subscriptions = new FakeSubscriptionRepository();
  const gateway = new FakeBillingGateway();
  const processor = new BillingGraceJobProcessor(subscriptions, gateway, new NoopLogger());
  return { processor, subscriptions, gateway };
}

describe('BillingGraceJobProcessor (B5, etapa 3)', () => {
  it('assinatura AINDA em atraso quando o job roda: cancela no Stripe', async () => {
    const { processor, subscriptions, gateway } = buildSut();
    subscriptions.seed({
      tenantId: 't1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    });
    gateway.subscription = {
      id: 'sub_1',
      customerId: 'cus_1',
      priceId: 'price_broadcast',
      status: 'past_due',
      cancelAtPeriodEnd: false,
    };

    await processor.process({ tenantId: 't1', subscriptionId: 'sub_1' });

    expect(gateway.calls).toContain('cancelSubscription:sub_1');
  });

  it('assinatura já PAGA nesse meio-tempo: não cancela nada', async () => {
    const { processor, subscriptions, gateway } = buildSut();
    subscriptions.seed({
      tenantId: 't1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    });
    gateway.subscription = {
      id: 'sub_1',
      customerId: 'cus_1',
      priceId: 'price_broadcast',
      status: 'active',
      cancelAtPeriodEnd: false,
    };

    await processor.process({ tenantId: 't1', subscriptionId: 'sub_1' });

    expect(gateway.calls.some((c) => c.startsWith('cancelSubscription:'))).toBe(false);
  });

  it('assinatura já não existe mais no Stripe (cliente cancelou pelo portal): não lança, só loga', async () => {
    const { processor, subscriptions, gateway } = buildSut();
    subscriptions.seed({
      tenantId: 't1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    });
    gateway.subscription = null;

    await expect(
      processor.process({ tenantId: 't1', subscriptionId: 'sub_1' }),
    ).resolves.toBeUndefined();
    expect(gateway.calls.some((c) => c.startsWith('cancelSubscription:'))).toBe(false);
  });

  it('a assinatura local mudou desde que o job foi agendado (subscriptionId não bate): não faz nada', async () => {
    const { processor, subscriptions, gateway } = buildSut();
    subscriptions.seed({
      tenantId: 't1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_novo',
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    });
    gateway.subscription = {
      id: 'sub_novo',
      customerId: 'cus_1',
      priceId: 'price_broadcast',
      status: 'past_due',
      cancelAtPeriodEnd: false,
    };

    await processor.process({ tenantId: 't1', subscriptionId: 'sub_velho' });

    expect(gateway.calls.some((c) => c.startsWith('cancelSubscription:'))).toBe(false);
  });

  it('tenant sem assinatura local nenhuma: não lança', async () => {
    const { processor } = buildSut();

    await expect(
      processor.process({ tenantId: 'tenant-sem-assinatura', subscriptionId: 'sub_1' }),
    ).resolves.toBeUndefined();
  });
});
