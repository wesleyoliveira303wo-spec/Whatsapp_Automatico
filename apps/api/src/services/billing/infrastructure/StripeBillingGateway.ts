import Stripe from 'stripe';

import { BillingGateway, GatewayEvent, GatewaySubscription } from '../domain/BillingGateway';
import { InvalidWebhookSignatureError } from '../domain/errors/billingErrors';

/** Status em que a assinatura ainda "vale" — preferidos na escolha da atual. */
const LIVE_STATUSES = new Set(['trialing', 'active', 'past_due', 'unpaid', 'incomplete']);

function toDate(seconds: number | null | undefined): Date | undefined {
  return typeof seconds === 'number' ? new Date(seconds * 1000) : undefined;
}

function customerIdOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
    return value.id;
  }
  return undefined;
}

/**
 * Adaptador da porta `BillingGateway` sobre a biblioteca oficial `stripe`
 * (B5, etapa 2). Exceção consciente à preferência do projeto por `fetch`
 * direto (como no `GeminiAiProvider`): a conferência de assinatura do webhook
 * não se reescreve à mão.
 *
 * Na API `2026-08-26.dahlia` (a da biblioteca 22.x) o fim do período mora em
 * cada ITEM da assinatura, não na assinatura — por isso `items.data[0]`.
 */
export class StripeBillingGateway implements BillingGateway {
  constructor(
    private readonly stripe: Stripe,
    private readonly webhookSecret: string,
  ) {}

  async createCustomer(input: { tenantId: string; name: string }): Promise<string> {
    const customer = await this.stripe.customers.create({
      name: input.name,
      metadata: { tenantId: input.tenantId },
    });
    return customer.id;
  }

  async createCheckoutSession(input: {
    customerId: string;
    tenantId: string;
    priceId: string;
    trialDays?: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      client_reference_id: input.tenantId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      payment_method_types: ['card'],
      payment_method_collection: 'always',
      locale: 'pt-BR',
      subscription_data: {
        metadata: { tenantId: input.tenantId },
        ...(input.trialDays ? { trial_period_days: input.trialDays } : {}),
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!session.url) {
      throw new Error('O Stripe não devolveu o endereço da página de pagamento.');
    }
    return session.url;
  }

  async expireOpenCheckoutSessions(customerId: string): Promise<void> {
    const open = await this.stripe.checkout.sessions.list({
      customer: customerId,
      status: 'open',
      limit: 10,
    });
    for (const session of open.data) {
      try {
        await this.stripe.checkout.sessions.expire(session.id);
      } catch {
        // Concluída ou vencida entre listar e expirar: já não pode ser paga de novo.
      }
    }
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return session.url;
  }

  async findCurrentSubscription(customerId: string): Promise<GatewaySubscription | null> {
    const { data } = await this.stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 10,
    });
    if (data.length === 0) return null;

    const newestFirst = [...data].sort((a, b) => b.created - a.created);
    const chosen = newestFirst.find((s) => LIVE_STATUSES.has(s.status)) ?? newestFirst[0];
    const item = chosen.items.data[0];
    return {
      id: chosen.id,
      customerId: customerIdOf(chosen.customer) ?? customerId,
      priceId: item?.price?.id,
      status: chosen.status,
      trialEnd: toDate(chosen.trial_end),
      currentPeriodEnd: toDate(item?.current_period_end),
      cancelAtPeriodEnd: chosen.cancel_at_period_end,
    };
  }

  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): GatewayEvent {
    if (!signature) throw new InvalidWebhookSignatureError();
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new InvalidWebhookSignatureError();
    }
    const object = event.data.object as { customer?: unknown };
    return { id: event.id, type: event.type, customerId: customerIdOf(object.customer) };
  }
}
