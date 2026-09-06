import { TenantPlan } from '../../../../shared/tenant/domain/TenantPlan';

/**
 * Números da plataforma inteira — Fase 3 (`ADMIN_PLATFORM_MASTER_PLAN.md`
 * §5.2). Cada campo tem fonte real; nenhum é inventado.
 *
 * `sessionsConnected` aqui é o valor CRU do banco. A sobreposição pelo
 * registry ao vivo (ADR #80) acontece na camada de cima (Application), que é
 * onde o resolvedor ao vivo é injetado.
 */
export interface PlatformTotals {
  tenants: {
    total: number;
    byPlan: Record<TenantPlan, number>;
  };
  users: number;
  sessions: {
    total: number;
    /** Status `CONNECTED` conforme o banco — ver nota acima. */
    connected: number;
  };
  messages30d: {
    inbound: number;
    outbound: number;
  };
  ai30d: {
    total: number;
    success: number;
    providerError: number;
    validationRejected: number;
    /** STRING decimal exata (D46). */
    costUsd: string;
  };
  campaigns: {
    running: number;
    /** `PAUSED` com `paused_reason` — pausadas pelo disjuntor de segurança. */
    pausedByBreaker: number;
  };
}
