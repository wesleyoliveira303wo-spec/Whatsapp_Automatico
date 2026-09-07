import { PlatformOverview } from '../domain/entities/PlatformOverview';
import { TenantObservabilityRepository } from '../domain/repositories/TenantObservabilityRepository';
import { buildActionQueue } from '../domain/platformActionQueue';
import {
  OBSERVABILITY_WINDOW_DAYS,
  TenantObservabilityService,
  windowStart,
} from './TenantObservabilityService';

/**
 * Application Service do Início do `/admin` — Fase 3 (§5).
 *
 * Não repete a lógica de sobreposição ao vivo nem de sinais: reaproveita
 * `TenantObservabilityService.listTenants()`, que já devolve a lista com o
 * status reconciliado (ADR #80) e os sinais anexados. Este serviço só soma
 * os KPIs globais (`platformTotals`) e monta a Fila de ação (função pura de
 * Domain).
 */
export class PlatformOverviewService {
  constructor(
    private readonly tenants: TenantObservabilityService,
    private readonly repository: TenantObservabilityRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getOverview(): Promise<PlatformOverview> {
    const now = this.now();
    const range = { from: windowStart(now), to: now };

    const [rows, totals] = await Promise.all([
      this.tenants.listTenants(),
      this.repository.platformTotals(range),
    ]);

    const tenantsNeedingAttention = rows.filter(
      (r) => r.signals[0]?.severity !== 'green',
    ).length;

    const actionQueue = buildActionQueue({
      tenants: rows.map((r) => ({ tenant: r.tenant, signals: r.signals })),
      campaignsPausedByBreaker: totals.campaigns.pausedByBreaker,
    });

    // `sessions.connected` reconciliado: soma dos `connectedSessionCount` já
    // sobrepostos pelo registry ao vivo dentro de `listTenants()`.
    const sessionsConnectedLive = rows.reduce(
      (sum, r) => sum + r.tenant.connectedSessionCount,
      0,
    );

    return {
      actionQueue,
      kpis: {
        ...totals,
        tenantsHealthy: rows.length - tenantsNeedingAttention,
        tenantsNeedingAttention,
        sessionsConnectedLive,
      },
    };
  }
}

/** Reexportado para quem só precisa do número da janela. */
export { OBSERVABILITY_WINDOW_DAYS };
