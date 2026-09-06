/**
 * Erros de domínio do acesso assistido (Fase 5). Traduzidos para HTTP pelo
 * `platformErrorHandler` (rotas `/api/platform/support/*`) e por um handler
 * próprio nas rotas tenant-scoped (`/api/tenants/:tenantId/support-access/*`).
 */

/** O pedido não existe (id inválido / nunca criado). → 404. */
export class SupportAccessNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Pedido de acesso ${id} não encontrado.`);
    this.name = 'SupportAccessNotFoundError';
  }
}

/**
 * Já existe um pedido `pending` ou um acesso vivo para este tenant. Só um por
 * vez (§9.1). → 409.
 */
export class SupportAccessAlreadyOpenError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Já há um pedido de acesso aberto para o tenant ${tenantId}.`);
    this.name = 'SupportAccessAlreadyOpenError';
  }
}

/**
 * A ação não cabe no estado atual do pedido: responder a um que não está
 * `pending`, revogar/encerrar um que não está vivo, emitir token de um que
 * não foi aceito. → 409.
 */
export class SupportAccessWrongStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupportAccessWrongStateError';
  }
}

/**
 * O `PlatformUser` que tenta emitir token / encerrar não é o dono do pedido,
 * ou o `tenantId` da rota não bate com o do pedido. → 403.
 */
export class SupportAccessForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupportAccessForbiddenError';
  }
}
