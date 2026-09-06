import { TenantOverview } from '../domain/entities/TenantOverview';
import { TenantDetail } from '../domain/entities/TenantDetail';
import { TenantObservabilityRepository } from '../domain/repositories/TenantObservabilityRepository';
import {
  TenantSignal,
  evaluateTenantSignals,
  worstSignal,
} from '../domain/tenantSignals';

/** Janela padrão dos agregados do Centro de Tenants (§6). */
export const OBSERVABILITY_WINDOW_DAYS = 30;

/** Ordem em que os sinais mais graves sobem na lista. */
const SEVERITY_RANK: Record<TenantSignal['severity'], number> = { red: 0, amber: 1, green: 2 };

export interface TenantListRow {
  tenant: TenantOverview;
  /** Todos os sinais que se aplicam, do mais grave ao menos (Domain). */
  signals: TenantSignal[];
}

export interface TenantDetailRow {
  tenant: TenantDetail;
  signals: TenantSignal[];
}

/**
 * Application Service do Centro de Tenants — Fase 2.
 *
 * Fino de propósito (mesmo padrão de `AnalyticsService`/`AuditLogService`):
 * resolve a janela de 30 dias, chama o repositório e ANEXA os sinais via a
 * função pura de Domain. Nenhuma regra de sinal vive aqui — só a ordenação da
 * LISTA (por urgência), que é decisão de apresentação, não de domínio.
 */
export class TenantObservabilityService {
  constructor(
    private readonly repository: TenantObservabilityRepository,
    /** Injetável só para teste determinístico da janela e do sinal "Sumiu". */
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listTenants(): Promise<TenantListRow[]> {
    const now = this.now();
    const range = { from: windowStart(now), to: now };

    const overviews = await this.repository.listTenantOverviews(range);

    const rows: TenantListRow[] = overviews.map((tenant) => ({
      tenant,
      signals: evaluateTenantSignals(tenant, now),
    }));

    // Ordena por urgência (§6.1 — "quem precisa de atenção primeiro"):
    //
    // 1. Severidade: vermelho, depois âmbar, depois verde.
    // 2. Dentro da MESMA faixa: quem tem atividade recente vem antes — um
    //    cliente vivo com a IA falhando é um incêndio; um tenant que nunca
    //    começou (sem atividade nenhuma) é um caso conhecido de
    //    acompanhamento, não uma surpresa. Por isso `lastActivityAt = null`
    //    vai para o FIM da faixa, não para o topo.
    // 3. Empate final: nome, para a lista ser estável entre recargas.
    return rows.sort((a, b) => {
      const bySeverity =
        SEVERITY_RANK[worstSignal(a.signals).severity] -
        SEVERITY_RANK[worstSignal(b.signals).severity];
      if (bySeverity !== 0) return bySeverity;

      const aActivity = a.tenant.lastActivityAt?.getTime() ?? -Infinity;
      const bActivity = b.tenant.lastActivityAt?.getTime() ?? -Infinity;
      if (aActivity !== bActivity) return bActivity - aActivity;

      return a.tenant.name.localeCompare(b.tenant.name, 'pt-BR');
    });
  }

  /** `null` se o tenant não existe — o router traduz para 404. */
  async getTenant(tenantId: string): Promise<TenantDetailRow | null> {
    const now = this.now();
    const range = { from: windowStart(now), to: now };

    const detail = await this.repository.getTenantDetail(tenantId, range);
    if (!detail) return null;

    return { tenant: detail, signals: evaluateTenantSignals(detail, now) };
  }
}

function windowStart(now: Date): Date {
  return new Date(now.getTime() - OBSERVABILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}
