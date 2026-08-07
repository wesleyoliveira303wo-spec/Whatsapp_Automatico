/**
 * Erro de Domain para quando um `id` de tag é referenciado (`PUT`/`DELETE`
 * do catálogo, ou `POST`/`DELETE` de atribuição) mas não existe, ou não
 * pertence ao `(tenantId, sessionName)` do pedido — mesmo racional de
 * `QuickReplyNotFoundError` (`services/quickReplies/domain/errors`).
 */
export class TagNotFoundError extends Error {
  constructor(id: string) {
    super(`Tag not found: ${id}`);
    this.name = 'TagNotFoundError';
  }
}
