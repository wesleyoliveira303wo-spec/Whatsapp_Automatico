/**
 * Espelho no painel da regra de plano do servidor
 * (`apps/api/src/shared/tenant/domain/planCapabilities.ts`, B5 2026-09-18).
 *
 * Só decide o que MOSTRAR — quem trava de verdade é a API. Se as duas tabelas
 * divergirem, o pior caso é o painel mostrar um botão que a API recusa com
 * 403; nunca o contrário.
 */
export type TenantPlan = 'free' | 'broadcast' | 'pro' | 'enterprise';
export type PlanCapability = 'operation' | 'ai';

/** Ordem de venda — a mesma da página de preços e do `/admin`. */
export const PLAN_ORDER: readonly TenantPlan[] = ['free', 'broadcast', 'pro', 'enterprise'];

/** Os planos que se assinam pelo Stripe (B5, etapa 2). */
export type PaidPlan = Exclude<TenantPlan, 'free'>;
export const PAID_PLANS: readonly PaidPlan[] = ['broadcast', 'pro', 'enterprise'];

/**
 * Preço mensal de cada plano, como aparece na tela. Um lugar só: a página de
 * venda e a aba Plano leem daqui. O preço COBRADO é o do Stripe (criado pelo
 * script `createStripePrices`) — se um mudar, o outro muda junto.
 */
export const PLAN_PRICE_LABEL: Record<TenantPlan, string> = {
  free: 'R$ 0',
  broadcast: 'R$ 69',
  pro: 'R$ 119',
  enterprise: 'R$ 249',
};

export const PLAN_LABEL: Record<TenantPlan, string> = {
  free: 'Grátis',
  broadcast: 'Disparos',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const CAPABILITIES: Record<TenantPlan, readonly PlanCapability[]> = {
  free: [],
  broadcast: ['operation'],
  pro: ['operation', 'ai'],
  enterprise: ['operation', 'ai'],
};

const SESSION_LIMITS: Record<TenantPlan, number> = {
  free: 1,
  broadcast: 1,
  pro: 1,
  enterprise: 5,
};

export function planAllows(plan: TenantPlan, capability: PlanCapability): boolean {
  return CAPABILITIES[plan].includes(capability);
}

export function sessionLimitFor(plan: TenantPlan): number {
  return SESSION_LIMITS[plan];
}
