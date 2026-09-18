import { TenantPlan } from './TenantPlan';

/**
 * O que um plano libera — fonte ÚNICA da regra (B5, 2026-09-18; substitui
 * `planPermiteUso`, que só sabia "pago libera tudo" e não comportava o plano
 * Disparos).
 *
 * `operation` — responder pela Dashboard, campanhas, disparos em grupos e as
 *   telas de operação (Contatos, Pipeline manual, Tags, Respostas rápidas,
 *   Analytics).
 * `ai` — tudo que chama o provider de IA: resposta automática, classificação
 *   do Pipeline, resumo de conversa, geração de mensagens de prospecção. É o
 *   único custo variável do produto — por isso é ele que separa o Disparos
 *   do Pro.
 *
 * Função pura, sem estado — mesmo estilo de `shouldAutoRespond`. Quem chama
 * resolve o `plan` do tenant e passa aqui. O painel tem um espelho desta
 * tabela em `apps/dashboard/lib/plans.ts`, que só decide o que MOSTRAR.
 */
export type PlanCapability = 'operation' | 'ai';

const CAPABILITIES: Record<TenantPlan, ReadonlySet<PlanCapability>> = {
  free: new Set(),
  broadcast: new Set(['operation']),
  pro: new Set(['operation', 'ai']),
  enterprise: new Set(['operation', 'ai']),
};

/**
 * Quantos WhatsApps o plano pode manter ocupando vaga — conectados ou com
 * credenciais guardadas (ver `WhatsAppSessionService.initSession`).
 */
const SESSION_LIMITS: Record<TenantPlan, number> = {
  free: 1,
  broadcast: 1,
  pro: 1,
  enterprise: 5,
};

export function planAllows(plan: TenantPlan, capability: PlanCapability): boolean {
  return CAPABILITIES[plan].has(capability);
}

export function sessionLimitFor(plan: TenantPlan): number {
  return SESSION_LIMITS[plan];
}
