/**
 * O que vai DENTRO do crachá de plataforma. Só quem é — nada de `tenantId`
 * nem `role`, porque um admin de plataforma não pertence a tenant nenhum e
 * não tem cargo (`PlatformUser`).
 *
 * Essa diferença de formato é uma GARANTIA, não um detalhe: um crachá de
 * tenant nunca passa na conferência daqui (faltam-lhe os campos certos e o
 * segredo é outro), e o contrário também não. Os dois porteiros não têm como
 * se confundir mesmo que uma rota seja montada no lugar errado.
 */
export interface PlatformSessionClaims {
  platformUserId: string;
}

/**
 * Porta do crachá do `/admin` (Fase 1). Mesmo contrato de
 * `AccessTokenService`: `verify` NUNCA lança — token inválido/expirado é um
 * resultado normal, não uma exceção.
 */
export interface PlatformSessionTokenService {
  issue(claims: PlatformSessionClaims): string;
  verify(token: string): PlatformSessionClaims | null;
}
