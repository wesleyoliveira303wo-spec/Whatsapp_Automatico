import { PlatformAuditEntry } from '../entities/PlatformAuditEntry';

/**
 * Porta da trilha da plataforma. Só `append` e leitura — append-only por
 * contrato, igual a `AuditLogRepository`: sem update, sem delete.
 */
export interface PlatformAuditLogRepository {
  append(entry: Omit<PlatformAuditEntry, 'id' | 'occurredAt'>): Promise<void>;

  /**
   * Lista da mais recente para a mais antiga, paginada por cursor — mesmo
   * contrato de `AuditLogRepository.listByTenant`. Consumida pela tela de
   * Auditoria (Fase 1 entrega a gravação; a tela é da Fase 3).
   */
  listRecent(limit: number, cursor?: string): Promise<PlatformAuditPage>;
}

export interface PlatformAuditPage {
  entries: PlatformAuditEntry[];
  /** Ausente indica fim — mesmo contrato das demais páginas por cursor. */
  nextCursor?: string;
}
