import { PlatformTotals } from './PlatformTotals';
import { ActionQueueItem } from '../platformActionQueue';

/**
 * O que o Início do `/admin` mostra — Fase 3
 * (`ADMIN_PLATFORM_MASTER_PLAN.md` §5).
 *
 * Duas partes: a Fila de ação ("o que eu preciso fazer agora?") e os KPIs
 * globais. Nada inventado — os KPIs vêm de `PlatformTotals` (agregação
 * direta) e os recortes por sinal vêm da avaliação dos mesmos sinais do §6.3
 * sobre a lista de tenants.
 */
export interface PlatformOverview {
  /** Ordenada por urgência. Vazia = nada precisa de você (§5.1). */
  actionQueue: ActionQueueItem[];

  kpis: PlatformTotals & {
    /** Tenants sem nenhum sinal de atenção (só 🟢 Saudável). */
    tenantsHealthy: number;
    /** Tenants com ao menos um sinal 🔴 ou 🟠. */
    tenantsNeedingAttention: number;
    /**
     * `sessions.connected` já reconciliado com o registry ao vivo (ADR #80)
     * quando o resolvedor está disponível — pode divergir do valor cru em
     * `kpis.sessions.connected` logo após um reinício da API.
     */
    sessionsConnectedLive: number;
  };
}
