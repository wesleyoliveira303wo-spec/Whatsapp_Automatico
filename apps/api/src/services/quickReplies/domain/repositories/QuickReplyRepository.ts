import { QuickReply } from '../entities/QuickReply';

/**
 * Porta (port) de persistência das respostas rápidas de UMA SESSÃO —
 * Fase 1, Bloco F1.9. Diferente de `AiBusinessProfileRepository` (1:1 por
 * sessão, `upsert`), aqui há VÁRIAS linhas por `(tenantId, sessionName)` —
 * CRUD completo (criar/listar/editar/remover), sempre escopado por tenant+
 * sessão (IDOR-safe: `update`/`remove` devolvem `null`/`false` quando o
 * `id` não pertence àquele par, em vez de vazar/afetar dado de outra
 * sessão ou tenant).
 */
export interface QuickReplyRepository {
  /** Lista as respostas da sessão, ordenadas por `createdAt` (mais antigas primeiro — ordem de cadastro). */
  listBySession(tenantId: string, sessionName: string): Promise<QuickReply[]>;

  /** Cria uma nova resposta rápida na sessão. */
  create(tenantId: string, sessionName: string, content: string): Promise<QuickReply>;

  /** Atualiza o texto de uma resposta existente. `null` se o `id` não existir ou não pertencer a `(tenantId, sessionName)`. */
  update(
    tenantId: string,
    sessionName: string,
    id: string,
    content: string,
  ): Promise<QuickReply | null>;

  /** Remove uma resposta. `false` se o `id` não existir ou não pertencer a `(tenantId, sessionName)`. */
  remove(tenantId: string, sessionName: string, id: string): Promise<boolean>;
}
