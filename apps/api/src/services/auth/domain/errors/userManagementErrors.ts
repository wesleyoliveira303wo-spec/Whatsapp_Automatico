/**
 * Erros de negocio da gestao de usuarios — Milestone 5, Bloco M5E. Mesmo
 * padrao de `ConversationOwnershipError`/`ConversationNotFoundError`
 * (services/conversations/domain/errors): classes de erro do Domain que a
 * Presentation (M5E-3) mapeia para status HTTP; a Application so lanca.
 *
 * Num unico arquivo (e nao um por classe) porque formam UM catalogo coeso do
 * mesmo caso de uso — sao 5 recusas do mesmo "RH", nao conceitos independentes.
 */

/** Usuario nao existe NESTE tenant (id errado OU de outro tenant — indistinguiveis de proposito, para nao vazar existencia entre tenants). Presentation: 404. */
export class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`Usuario nao encontrado: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

/** Ja existe usuario com este email neste tenant. Presentation: 409. */
export class EmailAlreadyInUseError extends Error {
  constructor(public readonly email: string) {
    super(`Email ja em uso neste tenant: ${email}`);
    this.name = 'EmailAlreadyInUseError';
  }
}

/**
 * A hierarquia nao permite a acao: o ator nao esta estritamente acima do
 * cargo-alvo (criar/promover para cargo igual ou acima do seu, ou mexer em
 * alguem que nao esta abaixo de si). Presentation: 403.
 */
export class RoleNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoleNotAllowedError';
  }
}

/** O ator tentou agir sobre a PROPRIA conta (auto-suspensao, auto-rebaixamento, auto-reset) — trava de "nao tranque a chave dentro do carro". Presentation: 422. */
export class SelfManagementError extends Error {
  constructor(public readonly action: string) {
    super(`Acao nao permitida sobre a propria conta: ${action}`);
    this.name = 'SelfManagementError';
  }
}

/** Senha provisoria fraca demais (menor que o minimo). Presentation: 422. */
export class WeakTemporaryPasswordError extends Error {
  constructor(public readonly minLength: number) {
    super(`Senha provisoria deve ter pelo menos ${minLength} caracteres`);
    this.name = 'WeakTemporaryPasswordError';
  }
}
