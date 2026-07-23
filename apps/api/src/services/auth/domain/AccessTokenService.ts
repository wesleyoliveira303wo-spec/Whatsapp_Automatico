import { UserRole } from './entities/User';

/**
 * O que vai DENTRO do cracha de acesso — Milestone 5, Bloco M5B. So o minimo
 * para autorizar uma requisicao sem ir ao banco: quem e (`userId`), de qual
 * empresa (`tenantId`) e o cargo (`role`). Nada sensivel (nunca a senha/hash).
 */
export interface AccessTokenClaims {
  userId: string;
  tenantId: string;
  role: UserRole;
}

/**
 * Porta (port) do cracha de acesso — Milestone 5, Bloco M5B (D53). Emite e
 * confere um token de curta duracao. A implementacao concreta (HS256 nativo,
 * ou uma lib de JWT no futuro) fica atras deste port — trocavel sem tocar o
 * `AuthService`/middlewares (M5C).
 */
export interface AccessTokenService {
  /** Emite um cracha assinado, valido por um tempo curto (definido na implementacao). */
  issue(claims: AccessTokenClaims): string;

  /**
   * Confere um cracha: assinatura valida, nao expirado, formato correto.
   * Devolve as informacoes se valido, ou `null` se invalido/expirado/adulterado
   * (nunca lanca — invalidez e um resultado normal, nao uma excecao).
   */
  verify(token: string): AccessTokenClaims | null;
}
