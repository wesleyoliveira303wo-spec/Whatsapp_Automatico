import { Tag, TagColor } from '../entities/Tag';

/** Dados para criar/atualizar uma tag. `name` obrigatório na criação; ambos opcionais na atualização (campo ausente preserva o valor já gravado). */
export interface TagInput {
  name?: string;
  color?: TagColor;
}

/**
 * Porta (port) de persistência das tags — Redesign 2026-08-05 (R4). Duas
 * responsabilidades no MESMO repositório, de propósito (não dois ports
 * separados): o catálogo (CRUD por sessão) e a ATRIBUIÇÃO de tags a
 * conversas (junção N:N) — ambas seguram a mesma tabela `WhatsAppTag`/
 * `WhatsAppConversationTag`, e mantê-las juntas evita uma dependência
 * cruzada entre bounded contexts (`services/conversations` nunca precisa
 * conhecer `services/tags` para além de LER `tags` na própria entidade
 * `Conversation`, populada via `include` direto no Postgres — ver
 * `PrismaConversationRepository`).
 *
 * `assign`/`unassign` são escopados por TENANT (nunca só por id) e validam
 * que a tag pertence à MESMA sessão da conversa — uma tag de "vendas" nunca
 * pode ser atribuída a uma conversa de "suporte", mesmo que ambas as
 * sessões sejam do mesmo tenant.
 */
export interface TagRepository {
  /** Lista as tags da sessão, ordenadas por nome. */
  listBySession(tenantId: string, sessionName: string): Promise<Tag[]>;

  /** Cria uma nova tag no catálogo da sessão. */
  create(tenantId: string, sessionName: string, name: string, color: TagColor): Promise<Tag>;

  /** Atualiza nome e/ou cor de uma tag existente. `null` se o `id` não existir ou não pertencer a `(tenantId, sessionName)`. */
  update(tenantId: string, sessionName: string, id: string, data: TagInput): Promise<Tag | null>;

  /** Remove uma tag do catálogo (cascata remove as atribuições existentes). `false` se o `id` não existir ou não pertencer a `(tenantId, sessionName)`. */
  remove(tenantId: string, sessionName: string, id: string): Promise<boolean>;

  /**
   * Atribui uma tag a uma conversa (idempotente — atribuir de novo não
   * duplica). `false` se a conversa não pertencer ao tenant, ou se a tag não
   * existir/não pertencer à MESMA sessão da conversa.
   */
  assign(tenantId: string, conversationId: string, tagId: string): Promise<boolean>;

  /**
   * Remove a atribuição de uma tag a uma conversa (idempotente — remover
   * uma atribuição inexistente não é erro). `false` só se a conversa não
   * pertencer ao tenant.
   */
  unassign(tenantId: string, conversationId: string, tagId: string): Promise<boolean>;
}
