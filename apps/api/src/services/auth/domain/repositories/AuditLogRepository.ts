import { AuditLog } from '../entities/AuditLog';

/** Campos para registrar um evento — `id`/`occurredAt` gerados pela persistencia (`occurredAt` = agora). Append-only: nao ha update/delete. */
export type NewAuditLog = Omit<AuditLog, 'id' | 'occurredAt'>;

/** Opcoes de listagem paginada por cursor de `listByTenant` — mesmo padrao de `ConversationRepository.findAllByTenant` (Bloco 5). `limit` obrigatorio no port (o default/teto vive na Application). */
export interface ListAuditLogsOptions {
  actorUserId?: string;
  action?: string;
  limit: number;
  cursor?: string;
}

/** Pagina de resultado — `nextCursor` ausente indica fim. */
export interface AuditLogPage {
  entries: AuditLog[];
  nextCursor?: string;
}

/**
 * Porta (port) da trilha de auditoria — Milestone 5, Bloco M5A. Append-only:
 * so `record` (escrita) e `listByTenant` (leitura paginada, para o viewer do
 * M5G) — nunca update/delete. Mesmo padrao imutavel de `AiInteractionRepository`.
 */
export interface AuditLogRepository {
  /** Grava um evento de auditoria. Devolve o registro criado (com `id`/`occurredAt`). */
  record(input: NewAuditLog): Promise<AuditLog>;

  /**
   * Lista eventos de um tenant, mais recentes primeiro, paginado por cursor
   * (mesma convencao de `ConversationRepository.findAllByTenant`). Filtros
   * opcionais por ator e por acao. `tenantId` sempre o primeiro filtro
   * (defesa em profundidade — nenhuma auditoria cruza a fronteira do tenant).
   */
  listByTenant(tenantId: string, options: ListAuditLogsOptions): Promise<AuditLogPage>;
}
