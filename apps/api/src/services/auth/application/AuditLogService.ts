import {
  AuditLogPage,
  AuditLogRepository,
  ListAuditLogsOptions,
} from '../domain/repositories/AuditLogRepository';

/** Teto de itens por página — mesmo racional de `DEFAULT_LIST_LIMIT`/teto de `usersRouter`/`conversationsRouter` (nunca listagem sem limite). */
export const DEFAULT_AUDIT_LOG_LIST_LIMIT = 20;
export const MAX_AUDIT_LOG_LIST_LIMIT = 100;

/**
 * Application Service do painel de auditoria (Fase 1, Bloco F1.5) — thin
 * service (D18): a trilha em si (`record`/`listByTenant`) já vive inteira no
 * `AuditLogRepository` desde a Milestone 5/M5A; este service só resolve o
 * default de `limit` fora do Zod (mesmo motivo documentado em
 * `usersRouter.ts` — `validateOrRespond` usa `z.ZodSchema<T>` com
 * input=output, que não representa schemas com `.default()`) e existe para
 * a Presentation nunca falar direto com o repositório (D18 sempre passa por
 * um Application Service, mesmo quando fino).
 */
export class AuditLogService {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  async listAuditLogs(
    tenantId: string,
    options: Omit<ListAuditLogsOptions, 'limit'> & { limit?: number },
  ): Promise<AuditLogPage> {
    const limit = Math.min(options.limit ?? DEFAULT_AUDIT_LOG_LIST_LIMIT, MAX_AUDIT_LOG_LIST_LIMIT);
    return this.auditLogRepository.listByTenant(tenantId, { ...options, limit });
  }
}
