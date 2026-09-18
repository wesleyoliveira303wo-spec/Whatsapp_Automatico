import { readBillingEnv } from '../../../../src/services/billing/infrastructure/billingConfig';

const FULL = {
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_PRICE_BROADCAST: 'price_b',
  STRIPE_PRICE_PRO: 'price_p',
  STRIPE_PRICE_ENTERPRISE: 'price_e',
  BILLING_PUBLIC_URL: 'https://app.francis.test/',
};

describe('readBillingEnv', () => {
  it('tudo presente: ligada, com o catálogo e a URL sem barra no fim', () => {
    expect(readBillingEnv(FULL)).toEqual({
      enabled: true,
      secretKey: 'sk_test_x',
      webhookSecret: 'whsec_x',
      catalog: { broadcast: 'price_b', pro: 'price_p', enterprise: 'price_e' },
      publicUrl: 'https://app.francis.test',
    });
  });

  it('faltando algo: desligada, com os NOMES exatos do que falta', () => {
    const { STRIPE_WEBHOOK_SECRET: _omit, ...rest } = FULL;
    expect(readBillingEnv({ ...rest, STRIPE_PRICE_PRO: '  ' })).toEqual({
      enabled: false,
      missing: ['STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PRO'],
    });
  });

  it('nada configurado (ambiente local de hoje): desligada', () => {
    expect(readBillingEnv({})).toMatchObject({ enabled: false });
  });
});
