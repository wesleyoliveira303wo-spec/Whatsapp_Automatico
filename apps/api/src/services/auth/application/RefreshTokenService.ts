import { RefreshTokenRepository } from '../domain/repositories/RefreshTokenRepository';
import { RefreshTokenCodec } from '../domain/RefreshTokenCodec';

/** Metadados opcionais de origem da sessao (so diagnostico/auditoria). */
export interface RefreshTokenMeta {
  userAgent?: string;
  ip?: string;
}

/**
 * Resultado de `rotate` — uniao discriminada (nao excecao): uma tentativa de
 * renovar com token invalido e um RESULTADO normal, nao um erro de programa.
 * O `AuthService` (M5C) mapeia cada caso para o HTTP certo.
 */
export type RotateRefreshTokenResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'reuse_detected' };

/**
 * Logica de ciclo de vida do refresh token (o "cartao de ponto") — Milestone
 * 5, Bloco M5B (D53/D58). Application: orquestra o `RefreshTokenRepository`
 * (M5A) + o `RefreshTokenCodec`. Nenhuma dependencia de HTTP/Prisma aqui —
 * testavel com Fakes.
 *
 * Regras:
 * - `issue`: gera token novo, guarda so o HASH + validade.
 * - `rotate` (ROTACAO): a cada uso, o token apresentado e REVOGADO e um novo e
 *   emitido. Se o token nao existe -> `not_found`. Se ja expirou -> `expired`.
 *   Se ja estava REVOGADO -> REUSO DETECTADO: alguem esta usando um token
 *   antigo (sinal de roubo), entao revogamos a FAMILIA INTEIRA do usuario
 *   (`revokeAllByUser`) e recusamos (`reuse_detected`).
 * - `revoke`/`revokeAllForUser`: logout de um dispositivo / de todos.
 */
export class RefreshTokenService {
  constructor(
    private readonly repository: RefreshTokenRepository,
    private readonly codec: RefreshTokenCodec,
    private readonly ttlMs: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async issue(userId: string, meta: RefreshTokenMeta = {}): Promise<string> {
    const { token, tokenHash } = this.codec.generate();
    const expiresAt = new Date(this.now().getTime() + this.ttlMs);
    await this.repository.create({
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    // Purga oportunista (Fase Auth, 2026-08-26): apaga tokens ja expirados
    // deste usuario a cada emissao nova. Best-effort — nunca impede o login.
    this.repository.purgeExpiredForUser(userId, this.now()).catch(() => {});
    return token;
  }

  async rotate(presentedToken: string): Promise<RotateRefreshTokenResult> {
    const tokenHash = this.codec.hash(presentedToken);
    const record = await this.repository.findByTokenHash(tokenHash);

    if (!record) {
      return { ok: false, reason: 'not_found' };
    }
    if (record.revokedAt !== undefined) {
      // Reuso de um token ja revogado = provavel roubo. Revoga a familia toda.
      await this.repository.revokeAllByUser(record.userId);
      return { ok: false, reason: 'reuse_detected' };
    }
    if (record.expiresAt.getTime() <= this.now().getTime()) {
      return { ok: false, reason: 'expired' };
    }

    await this.repository.revokeById(record.id);
    const token = await this.issue(record.userId, { userAgent: record.userAgent, ip: record.ip });
    return { ok: true, userId: record.userId, token };
  }

  async revoke(presentedToken: string): Promise<void> {
    const record = await this.repository.findByTokenHash(this.codec.hash(presentedToken));
    if (record) {
      await this.repository.revokeById(record.id);
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repository.revokeAllByUser(userId);
  }
}
