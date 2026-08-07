/**
 * Erro de Domain para quando um `id` de resposta rápida é referenciado
 * (`PUT`/`DELETE`) mas não existe, ou não pertence ao `(tenantId,
 * sessionName)` do pedido — mesmo racional de `TenantNotFoundError`
 * (`shared/tenant/domain/errors`): erro por CLASSE, não por comparação de
 * string, para a Presentation mapear para o status HTTP certo.
 */
export class QuickReplyNotFoundError extends Error {
  constructor(id: string) {
    super(`Quick reply not found: ${id}`);
    this.name = 'QuickReplyNotFoundError';
  }
}
