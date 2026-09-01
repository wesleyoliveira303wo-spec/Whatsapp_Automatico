import { TenantPlan } from '../../../../shared/tenant/domain/TenantPlan';

/**
 * Lançamento suave (2026-08-31) — porta ESTREITA para ler o Plano de um
 * tenant, usada pelos DOIS pontos que decidem `shouldAutoRespond`
 * (`MessageIngestionService` ao ingerir uma mensagem, e `AiReplyJobProcessor`
 * ao re-checar antes de gerar a resposta).
 *
 * Mesmo racional de `AiAvailabilityRepository` (Botão POWER, ADR #99): estes
 * dois consumidores só precisam saber "o plano permite uso?" — não o modelo
 * inteiro de `Tenant`, nem o `TenantRepository` de `shared/tenant` com seus
 * quatro métodos. A implementação real
 * (`TenantPlanFromTenantRepository`) apenas envolve o `TenantRepository`
 * compartilhado — nenhuma consulta nova ao banco além da que já existe.
 */
export interface TenantPlanRepository {
  /**
   * O Plano do tenant. Tenant inexistente devolve `'free'` (fail-closed:
   * sem plano confirmado, não se gera custo/uso de IA).
   */
  getPlan(tenantId: string): Promise<TenantPlan>;
}
