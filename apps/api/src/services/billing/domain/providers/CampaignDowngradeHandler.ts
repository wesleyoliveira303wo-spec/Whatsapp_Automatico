/**
 * Porta estreita para `services/campaigns` (B5, etapa 3) — mesmo padrão de
 * `SessionDowngradeHandler`.
 */
export interface CampaignDowngradeHandler {
  /**
   * Pausa toda campanha 1:1 `running` do tenant, motivo `plan_downgrade`.
   * Nunca cancela. Nunca lança.
   */
  pauseRunning(tenantId: string): Promise<void>;
}
