import { RefreshToken } from '../entities/RefreshToken';

/** Campos para criar um refresh token — `id`/`createdAt` gerados pela persistencia. `tokenHash` ja vem hasheado (o valor cru nunca chega ao repositorio). */
export type NewRefreshToken = Omit<RefreshToken, 'id' | 'createdAt'>;

/**
 * Porta (port) de persistencia de `RefreshToken` — Milestone 5, Bloco M5A.
 * A logica de rotacao/deteccao de reuso e escopo do M5B (Application); este
 * port so oferece as operacoes de dados que ela precisa: criar, achar pelo
 * hash, e revogar (uma ou todas de um usuario).
 */
export interface RefreshTokenRepository {
  create(input: NewRefreshToken): Promise<RefreshToken>;

  /** Localiza um token pelo seu hash — usado no refresh para validar o token apresentado. `null` se nao existir. */
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;

  /** Marca UM token como revogado (`revokedAt = agora`). Idempotente: revogar um ja revogado nao e erro. */
  revokeById(id: string): Promise<void>;

  /** Revoga TODOS os tokens ativos de um usuario — usado no logout-de-tudo e na deteccao de roubo (revogar a familia inteira). */
  revokeAllByUser(userId: string): Promise<void>;
}
