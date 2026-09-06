/**
 * Crachá de ACESSO ASSISTIDO — Painel `/admin`, Fase 5.
 *
 * É o "terceiro plano de auth" do produto: nem crachá de pessoa
 * (`AccessTokenService`), nem chave de máquina (API key). Identifica que uma
 * requisição a `/api/tenants/:tenantId/...` vem de um `PlatformUser` operando
 * o tenant dentro de uma janela de suporte.
 *
 * Segredo PRÓPRIO (`SUPPORT_ACCESS_TOKEN_SECRET`), distinto de
 * `ACCESS_TOKEN_SECRET` e `PLATFORM_SESSION_SECRET` — um crachá de um plano
 * nunca vale no outro. A validade real do acesso é o `TenantAccessRequest` no
 * banco (checado a cada requisição pelo `authenticate`); o `exp` do token é só
 * um fail-fast de 2h.
 */
export interface SupportAccessTokenService {
  issue(claims: SupportAccessClaims): string;
  /** Nunca lança — token inválido/expirado → `null`. */
  verify(token: string): SupportAccessClaims | null;
}

export interface SupportAccessClaims {
  supportAccessId: string;
  tenantId: string;
  platformUserId: string;
}
