import {
  canOpenPortal,
  canStartCheckout,
  describeBillingSituation,
  formatBillingDate,
  hasLiveSubscription,
  isSubscriptionConfirmed,
  whatsAppAllowanceLabel,
} from '../../lib/billingView';
import type { BillingStatus } from '../../lib/clientApi';

function billing(overrides: Partial<BillingStatus> = {}): BillingStatus {
  return {
    plan: 'free',
    planSource: 'self_service',
    billingEnabled: true,
    trialAvailable: true,
    subscription: null,
    ...overrides,
  };
}

function subscription(
  overrides: Partial<NonNullable<BillingStatus['subscription']>> = {},
): NonNullable<BillingStatus['subscription']> {
  return {
    plan: 'pro',
    status: 'active',
    trialEndsAt: null,
    currentPeriodEnd: '2026-10-18T15:00:00.000Z',
    cancelAtPeriodEnd: false,
    pastDueSince: null,
    ...overrides,
  };
}

describe('formatBillingDate', () => {
  it('mostra o dia no horário de Brasília, não em UTC', () => {
    // 02:00 UTC do dia 19 ainda é dia 18 em Brasília (UTC-3).
    expect(formatBillingDate('2026-09-19T02:00:00.000Z')).toBe('18/09');
  });
});

describe('describeBillingSituation', () => {
  it('Grátis sem assinatura', () => {
    expect(describeBillingSituation(billing())).toBe('Você está no Grátis.');
  });

  it('plano pago ativado pela equipe', () => {
    expect(describeBillingSituation(billing({ plan: 'pro', planSource: 'manual' }))).toBe(
      'Ativado pela equipe do Francis.',
    );
  });

  it('em teste: diz até quando e que a cobrança é nesse dia', () => {
    const b = billing({
      plan: 'pro',
      subscription: subscription({ status: 'trialing', trialEndsAt: '2026-09-19T15:00:00.000Z' }),
    });
    expect(describeBillingSituation(b)).toBe(
      'Teste grátis até 19/09. A primeira cobrança é feita nesse dia.',
    );
  });

  it('teste cancelado: não promete cobrança', () => {
    const b = billing({
      plan: 'pro',
      subscription: subscription({
        status: 'trialing',
        trialEndsAt: '2026-09-19T15:00:00.000Z',
        cancelAtPeriodEnd: true,
      }),
    });
    expect(describeBillingSituation(b)).toBe(
      'Teste grátis até 19/09. A assinatura foi cancelada e nada será cobrado.',
    );
  });

  it('ativa: próxima cobrança', () => {
    expect(describeBillingSituation(billing({ plan: 'pro', subscription: subscription() }))).toBe(
      'Próxima cobrança em 18/10.',
    );
  });

  it('ativa com cancelamento agendado', () => {
    const b = billing({ plan: 'pro', subscription: subscription({ cancelAtPeriodEnd: true }) });
    expect(describeBillingSituation(b)).toBe('Cancelamento agendado para 18/10.');
  });

  it('em atraso', () => {
    const b = billing({ plan: 'pro', subscription: subscription({ status: 'past_due' }) });
    expect(describeBillingSituation(b)).toBe(
      'Pagamento em atraso. Atualize o cartão em Gerenciar assinatura.',
    );
  });
});

describe('quais botões aparecem', () => {
  it('dono, cobrança ligada e sem assinatura: pode assinar', () => {
    expect(canStartCheckout(billing(), true)).toBe(true);
  });

  it('quem não é dono nunca vê os botões', () => {
    expect(canStartCheckout(billing(), false)).toBe(false);
    expect(canOpenPortal(billing({ subscription: subscription() }), false)).toBe(false);
  });

  it('cobrança desligada: nada de botão', () => {
    expect(canStartCheckout(billing({ billingEnabled: false }), true)).toBe(false);
  });

  it.each(['trialing', 'active', 'past_due'] as const)(
    'assinatura %s valendo: não assina de novo, gerencia',
    (status) => {
      const b = billing({ plan: 'pro', subscription: subscription({ status }) });
      expect(hasLiveSubscription(b)).toBe(true);
      expect(canStartCheckout(b, true)).toBe(false);
      expect(canOpenPortal(b, true)).toBe(true);
    },
  );

  it('assinatura cancelada: pode assinar de novo e ainda abre o portal', () => {
    const b = billing({ subscription: subscription({ status: 'canceled' }) });
    expect(canStartCheckout(b, true)).toBe(true);
    expect(canOpenPortal(b, true)).toBe(true);
  });

  it('plano pago pela equipe: sem assinatura pelo site', () => {
    expect(canStartCheckout(billing({ plan: 'pro', planSource: 'manual' }), true)).toBe(false);
  });

  it('sem conta no Stripe: nada para gerenciar', () => {
    expect(canOpenPortal(billing(), true)).toBe(false);
  });
});

describe('isSubscriptionConfirmed', () => {
  it('só teste ou ativa confirmam o pagamento', () => {
    expect(
      isSubscriptionConfirmed(billing({ subscription: subscription({ status: 'trialing' }) })),
    ).toBe(true);
    expect(
      isSubscriptionConfirmed(billing({ subscription: subscription({ status: 'active' }) })),
    ).toBe(true);
    expect(
      isSubscriptionConfirmed(billing({ subscription: subscription({ status: 'incomplete' }) })),
    ).toBe(false);
    expect(isSubscriptionConfirmed(billing())).toBe(false);
  });
});

describe('whatsAppAllowanceLabel', () => {
  it('lê o mesmo limite da API', () => {
    expect(whatsAppAllowanceLabel('broadcast')).toBe('1 WhatsApp');
    expect(whatsAppAllowanceLabel('pro')).toBe('1 WhatsApp');
    expect(whatsAppAllowanceLabel('enterprise')).toBe('Até 5 WhatsApps');
  });
});
