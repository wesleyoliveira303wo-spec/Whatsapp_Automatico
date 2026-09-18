import { planForPrice, priceForPlan } from '../../../../src/services/billing/domain/priceCatalog';
import {
  planFromSubscription,
  toSubscriptionStatus,
} from '../../../../src/services/billing/domain/subscriptionState';
import { GatewaySubscription } from '../../../../src/services/billing/domain/BillingGateway';

/**
 * Regras puras da cobrança (B5, etapa 2). É daqui que sai "que plano este
 * tenant deve ter agora" — o webhook só relê o Stripe e aplica o resultado.
 */
const catalog = { broadcast: 'price_b', pro: 'price_p', enterprise: 'price_e' };

function sub(over: Partial<GatewaySubscription> = {}): GatewaySubscription {
  return {
    id: 'sub_1',
    customerId: 'cus_1',
    priceId: 'price_p',
    status: 'active',
    cancelAtPeriodEnd: false,
    ...over,
  };
}

describe('catálogo de preços', () => {
  it('mapeia preço ↔ plano nos dois sentidos', () => {
    expect(planForPrice(catalog, 'price_b')).toBe('broadcast');
    expect(priceForPlan(catalog, 'enterprise')).toBe('price_e');
  });

  it('preço que não é nosso devolve undefined', () => {
    expect(planForPrice(catalog, 'price_de_outro_produto')).toBeUndefined();
  });
});

describe('toSubscriptionStatus', () => {
  it.each([
    ['trialing', 'trialing'],
    ['active', 'active'],
    ['past_due', 'past_due'],
    ['unpaid', 'past_due'],
    ['incomplete', 'incomplete'],
    ['incomplete_expired', 'canceled'],
    ['canceled', 'canceled'],
    ['paused', 'canceled'],
    ['algo_novo', 'incomplete'],
  ])('%s → %s', (raw, expected) => {
    expect(toSubscriptionStatus(raw)).toBe(expected);
  });
});

describe('planFromSubscription', () => {
  it('sem assinatura: Grátis', () => {
    expect(planFromSubscription(null, catalog)).toBe('free');
  });

  it.each(['trialing', 'active', 'past_due', 'unpaid'])('%s mantém o plano do preço', (status) => {
    expect(planFromSubscription(sub({ status }), catalog)).toBe('pro');
  });

  it.each(['canceled', 'incomplete', 'incomplete_expired', 'paused'])('%s: Grátis', (status) => {
    expect(planFromSubscription(sub({ status }), catalog)).toBe('free');
  });

  it('preço desconhecido: undefined (quem chama não mexe no plano)', () => {
    expect(planFromSubscription(sub({ priceId: 'price_x' }), catalog)).toBeUndefined();
  });

  it('assinatura valendo sem preço: undefined', () => {
    expect(planFromSubscription(sub({ priceId: undefined }), catalog)).toBeUndefined();
  });
});
