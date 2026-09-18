import { TenantPlan } from '../../../shared/tenant/domain/TenantPlan';

/** Os planos que se assinam pelo Stripe (o Grátis não tem preço). */
export type PaidPlan = Exclude<TenantPlan, 'free'>;

export const PAID_PLANS: readonly PaidPlan[] = ['broadcast', 'pro', 'enterprise'];

/**
 * Plano → id do preço no Stripe (`STRIPE_PRICE_*`). Vem do ambiente porque
 * cada conta Stripe (teste, produção) tem ids próprios — os preços são
 * criados pelo script `createStripePrices`.
 */
export type PriceCatalog = Record<PaidPlan, string>;

export function planForPrice(catalog: PriceCatalog, priceId: string): PaidPlan | undefined {
  return PAID_PLANS.find((plan) => catalog[plan] === priceId);
}

export function priceForPlan(catalog: PriceCatalog, plan: PaidPlan): string {
  return catalog[plan];
}
