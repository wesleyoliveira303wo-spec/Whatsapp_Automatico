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
