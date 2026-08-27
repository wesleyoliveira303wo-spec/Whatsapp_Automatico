/**
 * Erro de Domain para quando um `id` de FAQ é referenciado (`PUT`/`DELETE`)
 * mas não existe, ou não pertence ao `(tenantId, sessionName)` do pedido —
 * mesmo racional de `QuickReplyNotFoundError`.
 */
export class AiFaqEntryNotFoundError extends Error {
  constructor(id: string) {
    super(`AI FAQ entry not found: ${id}`);
    this.name = 'AiFaqEntryNotFoundError';
  }
}
