import { PlatformHealth } from '../domain/entities/PlatformHealth';
import { TenantObservabilityRepository } from '../domain/repositories/TenantObservabilityRepository';
import { PlatformHealthProbe } from '../domain/providers/PlatformHealthProbe';
import { TenantObservabilityService, windowStart } from './TenantObservabilityService';

/**
 * Application Service da tela Saúde do `/admin` — Fase 3 (§15).
 *
 * Junta três leituras que já existem, nenhuma nova:
 * - infra (Postgres/Redis/3 filas) → `PlatformHealthProbe` (opcional; sem
 *   ele, `infra: null`);
 * - falhas de IA da janela → `platformTotals.ai30d`;
 * - WhatsApps caídos → contagem de tenants com o sinal 🔴 Desconectado,
 *   já reconciliado pelo registry ao vivo dentro de `listTenants()`.
 */
export class PlatformHealthService {
  private probe?: PlatformHealthProbe;

  constructor(
    private readonly tenants: TenantObservabilityService,
    private readonly repository: TenantObservabilityRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Injeção tardia (D15) — o probe depende de conexões que só existem em `index.ts`. */
  setHealthProbe(probe: PlatformHealthProbe): void {
    this.probe = probe;
  }

  async getHealth(): Promise<PlatformHealth> {
    const now = this.now();
    const range = { from: windowStart(now), to: now };

    const [infra, totals, rows] = await Promise.all([
      this.probe ? this.probe.snapshot() : Promise.resolve(null),
      this.repository.platformTotals(range),
      this.tenants.listTenants(),
    ]);

    const total = totals.ai30d.total;
    const providerError = totals.ai30d.providerError;

    return {
      infra,
      aiFailures30d: {
        total,
        providerError,
        rate: total > 0 ? providerError / total : null,
      },
      tenantsWithSessionsDown: rows.filter((r) =>
        r.signals.some((s) => s.key === 'disconnected'),
      ).length,
    };
  }
}
