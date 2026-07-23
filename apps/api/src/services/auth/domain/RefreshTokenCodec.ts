/** Um refresh token recem-gerado: o valor CRU (entregue ao cliente, uma unica vez) e o HASH (o unico que vai pro banco). */
export interface GeneratedRefreshToken {
  token: string;
  tokenHash: string;
}

/**
 * Porta (port) de geracao/hash de refresh token — Milestone 5, Bloco M5B.
 * Diferente da SENHA: o refresh token e gerado por maquina e tem ALTA entropia,
 * entao o hash pode ser rapido (SHA-256) — nao precisa de KDF lento. Guardamos
 * so o hash (mesmo principio de `apiKeyHash`): um vazamento do banco nao
 * entrega tokens reutilizaveis. Atras de port para ser injetavel/testavel.
 */
export interface RefreshTokenCodec {
  /** Gera um token aleatorio novo e seu hash. */
  generate(): GeneratedRefreshToken;

  /** Calcula o hash de um token apresentado, para localiza-lo no banco (deterministico). */
  hash(token: string): string;
}
