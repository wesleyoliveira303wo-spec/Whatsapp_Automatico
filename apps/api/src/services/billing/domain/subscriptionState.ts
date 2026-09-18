import { TenantPlan } from '../../../shared/tenant/domain/TenantPlan';
import { GatewaySubscription } from './BillingGateway';
import { SubscriptionStatus } from './entities/Subscription';
import { PriceCatalog, planForPrice } from './priceCatalog';

/** Situações em que o tenant tem o plano pago (o atraso ainda está na tolerância). */
export const ACTIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
];

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  incomplete: 'incomplete',
  incomplete_expired: 'canceled',
  canceled: 'canceled',
  paused: 'canceled',
};

/** Status cru do Stripe → situação do Francis. Desconhecido vira `incomplete` (não libera nada). */
export function toSubscriptionStatus(raw: string): SubscriptionStatus {
  return STATUS_MAP[raw] ?? 'incomplete';
}

/**
 * Qual plano o tenant deve ter, dada a assinatura que vale agora. `undefined`
 * quando o preço não é nosso (ou não veio) — quem chama não mexe no plano e
 * registra.
 */
export function planFromSubscription(
  subscription: GatewaySubscription | null,
  catalog: PriceCatalog,
): TenantPlan | undefined {
  if (!subscription) return 'free';
  const status = toSubscriptionStatus(subscription.status);
  if (!ACTIVE_SUBSCRIPTION_STATUSES.includes(status)) return 'free';
  if (!subscription.priceId) return undefined;
  return planForPrice(catalog, subscription.priceId);
}
