import Stripe from 'stripe';

import { StripeBillingGateway } from '../../../../src/services/billing/infrastructure/StripeBillingGateway';
import { InvalidWebhookSignatureError } from '../../../../src/services/billing/domain/errors/billingErrors';

/**
 * O adaptador do Stripe (B5, etapa 2). Usa uma instância REAL da biblioteca —
 * criá-la não acessa a rede — com `jest.spyOn` só nos métodos que chamariam a
 * API. A conferência de assinatura usa a função real
 * `webhooks.generateTestHeaderString`, que é offline: é a única forma de
 * provar que um aviso forjado é mesmo recusado.
 */
const SECRET = 'whsec_test_secret';

function build(): { stripe: Stripe; gateway: StripeBillingGateway } {
  const stripe = new Stripe('sk_test_fake');
  return { stripe, gateway: new StripeBillingGateway(stripe, SECRET) };
}

function stripeSubscription(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'sub_1',
    status: 'active',
    created: 100,
    customer: 'cus_1',
    cancel_at_period_end: false,
    trial_end: null,
    items: { data: [{ price: { id: 'price_p' }, current_period_end: 1_800_000_000 }] },
    ...over,
  };
}

describe('StripeBillingGateway', () => {
  it('cliente: guarda o tenant nos metadados', async () => {
    const { stripe, gateway } = build();
    const create = jest
      .spyOn(stripe.customers, 'create')
      .mockResolvedValue({ id: 'cus_9' } as never);

    await expect(gateway.createCustomer({ tenantId: 't1', name: 'Loja' })).resolves.toBe('cus_9');
    expect(create).toHaveBeenCalledWith({ name: 'Loja', metadata: { tenantId: 't1' } });
  });

  it('expira as páginas de pagamento ainda abertas do cliente', async () => {
    const { stripe, gateway } = build();
    const list = jest.spyOn(stripe.checkout.sessions, 'list').mockResolvedValue({
      data: [{ id: 'cs_a' }, { id: 'cs_b' }],
    } as never);
    const expire = jest.spyOn(stripe.checkout.sessions, 'expire').mockResolvedValue({} as never);

    await gateway.expireOpenCheckoutSessions('cus_1');

    expect(list).toHaveBeenCalledWith({ customer: 'cus_1', status: 'open', limit: 10 });
    expect(expire).toHaveBeenCalledWith('cs_a');
    expect(expire).toHaveBeenCalledWith('cs_b');
  });

  it('página que venceu entre listar e expirar não impede o checkout novo', async () => {
    const { stripe, gateway } = build();
    jest
      .spyOn(stripe.checkout.sessions, 'list')
      .mockResolvedValue({ data: [{ id: 'cs_a' }] } as never);
    jest
      .spyOn(stripe.checkout.sessions, 'expire')
      .mockRejectedValue(new Error('Only Checkout Sessions with a status of open can be expired.'));

    await expect(gateway.expireOpenCheckoutSessions('cus_1')).resolves.toBeUndefined();
  });

  it('checkout: assinatura só cartão, pt-BR, com o tenant e o teste quando pedido', async () => {
    const { stripe, gateway } = build();
    const create = jest
      .spyOn(stripe.checkout.sessions, 'create')
      .mockResolvedValue({ url: 'https://checkout.stripe.com/x' } as never);

    const url = await gateway.createCheckoutSession({
      customerId: 'cus_1',
      tenantId: 't1',
      priceId: 'price_p',
      trialDays: 1,
      successUrl: 'https://app/settings/plano?checkout=done',
      cancelUrl: 'https://app/settings/plano?checkout=canceled',
    });

    expect(url).toBe('https://checkout.stripe.com/x');
    expect(create).toHaveBeenCalledWith({
      mode: 'subscription',
      customer: 'cus_1',
      client_reference_id: 't1',
      line_items: [{ price: 'price_p', quantity: 1 }],
      payment_method_types: ['card'],
      payment_method_collection: 'always',
      locale: 'pt-BR',
      subscription_data: { metadata: { tenantId: 't1' }, trial_period_days: 1 },
      success_url: 'https://app/settings/plano?checkout=done',
      cancel_url: 'https://app/settings/plano?checkout=canceled',
    });
  });

  it('checkout sem teste não manda trial_period_days', async () => {
    const { stripe, gateway } = build();
    const create = jest
      .spyOn(stripe.checkout.sessions, 'create')
      .mockResolvedValue({ url: 'u' } as never);

    await gateway.createCheckoutSession({
      customerId: 'cus_1',
      tenantId: 't1',
      priceId: 'price_p',
      successUrl: 's',
      cancelUrl: 'c',
    });

    const params = create.mock.calls[0][0] as { subscription_data: object };
    expect(params.subscription_data).toEqual({ metadata: { tenantId: 't1' } });
  });

  it('checkout sem URL de volta do Stripe: erro claro', async () => {
    const { stripe, gateway } = build();
    jest.spyOn(stripe.checkout.sessions, 'create').mockResolvedValue({ url: null } as never);

    await expect(
      gateway.createCheckoutSession({
        customerId: 'cus_1',
        tenantId: 't1',
        priceId: 'price_p',
        successUrl: 's',
        cancelUrl: 'c',
      }),
    ).rejects.toThrow('página de pagamento');
  });

  it('portal: volta para o endereço pedido', async () => {
    const { stripe, gateway } = build();
    const create = jest
      .spyOn(stripe.billingPortal.sessions, 'create')
      .mockResolvedValue({ url: 'https://billing.stripe.com/p' } as never);

    await expect(
      gateway.createPortalSession({ customerId: 'cus_1', returnUrl: 'https://app/settings/plano' }),
    ).resolves.toBe('https://billing.stripe.com/p');
    expect(create).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://app/settings/plano',
    });
  });

  it('assinatura atual: prefere a que está valendo e lê o fim do período no item', async () => {
    const { stripe, gateway } = build();
    jest.spyOn(stripe.subscriptions, 'list').mockResolvedValue({
      data: [
        stripeSubscription({
          id: 'sub_old',
          status: 'canceled',
          created: 300,
          items: { data: [{ price: { id: 'price_b' }, current_period_end: 1 }] },
        }),
        stripeSubscription({
          id: 'sub_new',
          status: 'trialing',
          created: 200,
          trial_end: 1_800_000_000,
        }),
      ],
    } as never);

    await expect(gateway.findCurrentSubscription('cus_1')).resolves.toEqual({
      id: 'sub_new',
      customerId: 'cus_1',
      priceId: 'price_p',
      status: 'trialing',
      trialEnd: new Date(1_800_000_000 * 1000),
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
      cancelAtPeriodEnd: false,
    });
  });

  it('só assinaturas encerradas: devolve a mais recente delas', async () => {
    const { stripe, gateway } = build();
    jest.spyOn(stripe.subscriptions, 'list').mockResolvedValue({
      data: [
        stripeSubscription({ id: 'sub_a', status: 'canceled', created: 100 }),
        stripeSubscription({ id: 'sub_b', status: 'canceled', created: 200 }),
      ],
    } as never);

    await expect(gateway.findCurrentSubscription('cus_1')).resolves.toMatchObject({
      id: 'sub_b',
      status: 'canceled',
    });
  });

  it('sem assinatura nenhuma: null', async () => {
    const { stripe, gateway } = build();
    jest.spyOn(stripe.subscriptions, 'list').mockResolvedValue({ data: [] } as never);
    await expect(gateway.findCurrentSubscription('cus_1')).resolves.toBeNull();
  });

  it('aviso com assinatura válida: devolve id, tipo e cliente', () => {
    const { stripe, gateway } = build();
    const payload = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      type: 'invoice.paid',
      data: { object: { object: 'invoice', customer: 'cus_1' } },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

    expect(gateway.parseWebhookEvent(Buffer.from(payload), header)).toEqual({
      id: 'evt_1',
      type: 'invoice.paid',
      customerId: 'cus_1',
    });
  });

  it('aviso assinado com outro segredo, ou sem assinatura: recusa', () => {
    const { stripe, gateway } = build();
    const payload = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      type: 'invoice.paid',
      data: { object: {} },
    });
    const forged = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_outro' });

    expect(() => gateway.parseWebhookEvent(Buffer.from(payload), forged)).toThrow(
      InvalidWebhookSignatureError,
    );
    expect(() => gateway.parseWebhookEvent(Buffer.from(payload), undefined)).toThrow(
      InvalidWebhookSignatureError,
    );
  });

  it('corpo alterado depois de assinado: recusa', () => {
    const { stripe, gateway } = build();
    const payload = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      type: 'invoice.paid',
      data: { object: { customer: 'cus_1' } },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const tampered = payload.replace('cus_1', 'cus_2');

    expect(() => gateway.parseWebhookEvent(Buffer.from(tampered), header)).toThrow(
      InvalidWebhookSignatureError,
    );
  });

  it('cancela a assinatura no Stripe (B5, etapa 3 — fim da tolerância de atraso)', async () => {
    const { stripe, gateway } = build();
    const cancel = jest.spyOn(stripe.subscriptions, 'cancel').mockResolvedValue({} as never);

    await gateway.cancelSubscription('sub_1');

    expect(cancel).toHaveBeenCalledWith('sub_1');
  });
});
