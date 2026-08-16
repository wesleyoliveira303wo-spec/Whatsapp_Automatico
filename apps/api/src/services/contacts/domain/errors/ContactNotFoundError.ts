/**
 * Erro de Domain para quando um `id` de contato é referenciado (opt-out/
 * opt-in manual) mas não existe, ou não pertence ao tenant do pedido — Fase
 * L, Bloco L2. Mesmo racional de `TagNotFoundError`/`ConversationNotFoundError`.
 */
export class ContactNotFoundError extends Error {
  constructor(id: string) {
    super(`Contact not found: ${id}`);
    this.name = 'ContactNotFoundError';
  }
}
