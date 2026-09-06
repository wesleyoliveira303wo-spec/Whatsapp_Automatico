import { PlatformHealthSnapshot } from '../providers/PlatformHealthProbe';

/**
 * O que a tela Saúde do `/admin` mostra — Fase 3
 * (`ADMIN_PLATFORM_MASTER_PLAN.md` §15: "3 filas, Postgres, Redis, falhas de
 * IA, WhatsApps caídos").
 */
export interface PlatformHealth {
  /**
   * Infra (Postgres, Redis, as 3 filas). `null` quando não há
   * `PlatformHealthProbe` — modo degradado, sem `REDIS_URL`: a tela diz "não
   * verificável" em vez de mostrar zeros.
   */
  infra: PlatformHealthSnapshot | null;

  /** Falhas de IA na janela de 30 dias — plataforma inteira. */
  aiFailures30d: {
    total: number;
    providerError: number;
    /** `providerError / total`, ou `null` quando `total = 0` (nunca "0%" enganoso). */
    rate: number | null;
  };

  /** Tenants com WhatsApp fora do ar (sinal 🔴 Desconectado, já reconciliado). */
  tenantsWithSessionsDown: number;
}
