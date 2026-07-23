/**
 * Token de renovacao de sessao (o "cartao de ponto" de longa duracao) —
 * Milestone 5, Bloco M5A (espelha o model `RefreshToken` no schema).
 *
 * `tokenHash` e o HASH do token, nunca o valor cru entregue ao cliente
 * (mesmo principio de `apiKeyHash`/`passwordHash`): um vazamento do banco nao
 * permite reusar tokens. `revokedAt` marca revogacao (logout, troca de senha,
 * deteccao de roubo) sem apagar a linha — a rotacao/deteccao de reuso sao
 * escopo do M5B. `userAgent`/`ip` sao opcionais, so para diagnostico/auditoria
 * de "de onde essa sessao foi aberta".
 */
export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  userAgent?: string;
  ip?: string;
}
