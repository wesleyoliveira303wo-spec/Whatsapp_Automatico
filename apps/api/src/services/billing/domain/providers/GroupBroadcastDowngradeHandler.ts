/**
 * Porta estreita para `services/groupBroadcasts` (B5, etapa 3) — mesmo
 * padrão de `SessionDowngradeHandler`.
 */
export interface GroupBroadcastDowngradeHandler {
  /**
   * Pausa todo disparo em grupos `running` do tenant, motivo
   * `plan_downgrade`. Nunca cancela. Nunca lança.
   */
  pauseRunning(tenantId: string): Promise<void>;
}
