import { Logger } from '../../../shared/domain/Logger';
import { UserRepository } from '../domain/repositories/UserRepository';
import { AuditLogRepository } from '../domain/repositories/AuditLogRepository';
import { PasswordHasher } from '../domain/PasswordHasher';
import { AccessTokenService } from '../domain/AccessTokenService';
import { RefreshTokenService } from './RefreshTokenService';
import { PublicUser, toPublicUser } from '../domain/entities/User';
import { MIN_PASSWORD_LENGTH } from '../domain/passwordPolicy';

/** Metadados de origem da requisicao (so diagnostico/auditoria). */
export interface AuthRequestMeta {
  userAgent?: string;
  ip?: string;
}

/** Resultado do login — uniao discriminada. No caminho de FALHA, deliberadamente generico (sem dizer se foi email ou senha) para nao permitir enumeracao de usuarios. */
export type LoginResult =
  { ok: true; accessToken: string; refreshToken: string; user: PublicUser } | { ok: false };

/** Resultado do refresh — uniao discriminada. */
export type RefreshResult = { ok: true; accessToken: string; refreshToken: string } | { ok: false };

/**
 * Resultado da troca da PROPRIA senha (M5F-2) — uniao discriminada.
 * `invalid_current_password` cobre tambem usuario inexistente/suspenso
 * (indistinguiveis de proposito, mesma anti-enumeracao do login).
 */
export type ChangePasswordResult =
  { ok: true } | { ok: false; reason: 'invalid_current_password' | 'weak_password' };

/**
 * Hash "isca" (formato scrypt valido, conteudo irrelevante) usado quando o
 * usuario NAO existe: verificamos a senha contra ele mesmo assim, para que o
 * tempo de resposta de "email inexistente" seja parecido com o de "senha
 * errada" — fecha o vazamento de existencia de usuario por timing.
 */
const DUMMY_PASSWORD_HASH = `scrypt:16384:8:1:${'0'.repeat(32)}:${'0'.repeat(128)}`;

/**
 * Application Service de autenticacao (o "porteiro") — Milestone 5, Bloco M5C
 * (D52: `apps/api` e a autoridade de auth). Orquestra as pecas do M5B
 * (hash de senha, cracha, cartao de ponto) + os repositorios do M5A (usuario,
 * auditoria). Nenhuma dependencia de HTTP/Prisma aqui — testavel com Fakes.
 *
 * Toda falha de login/refresh e um RESULTADO (`ok: false`), nao uma excecao —
 * a Presentation (authRouter) mapeia para 401. Falhas sao AUDITADAS.
 */
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokenService: AccessTokenService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async login(
    tenantId: string,
    email: string,
    password: string,
    meta: AuthRequestMeta = {},
  ): Promise<LoginResult> {
    const user = await this.userRepository.findByTenantAndEmail(tenantId, email);

    // Timing: verifica sempre (contra o hash real, ou contra a isca) para que
    // "usuario inexistente" e "senha errada" levem tempos parecidos.
    const passwordOk = await this.passwordHasher.verify(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || user.status !== 'active' || !passwordOk) {
      await this.audit(tenantId, null, 'auth.login.failure', { email }, meta);
      return { ok: false };
    }

    const updated = await this.userRepository.update(user.id, { lastLoginAt: this.now() });
    const accessToken = this.accessTokenService.issue({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    const refreshToken = await this.refreshTokenService.issue(user.id, meta);

    await this.audit(tenantId, user.id, 'auth.login.success', {}, meta);
    return { ok: true, accessToken, refreshToken, user: toPublicUser(updated ?? user) };
  }

  async refresh(presentedRefreshToken: string): Promise<RefreshResult> {
    const rotated = await this.refreshTokenService.rotate(presentedRefreshToken);
    if (!rotated.ok) {
      return { ok: false };
    }

    const user = await this.userRepository.findById(rotated.userId);
    if (!user || user.status !== 'active') {
      // Usuario sumiu/foi suspenso depois do token ser emitido — derruba tudo.
      await this.refreshTokenService.revokeAllForUser(rotated.userId);
      return { ok: false };
    }

    const accessToken = this.accessTokenService.issue({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    return { ok: true, accessToken, refreshToken: rotated.token };
  }

  async logout(
    tenantId: string,
    actorUserId: string,
    presentedRefreshToken: string,
    meta: AuthRequestMeta = {},
  ): Promise<void> {
    await this.refreshTokenService.revoke(presentedRefreshToken);
    await this.audit(tenantId, actorUserId, 'auth.logout', {}, meta);
  }

  async getMe(userId: string): Promise<PublicUser | null> {
    const user = await this.userRepository.findById(userId);
    return user ? toPublicUser(user) : null;
  }

  /**
   * Troca da PROPRIA senha (M5F-2) — exige a senha ATUAL (diferente do reset
   * pelo RH, que e um admin agindo sobre um subordinado — M5E-2). Sucesso:
   * grava o hash novo, desliga `mustChangePassword` (o post-it de senha
   * provisoria sai) e REVOGA todos os refresh tokens — sessoes antigas morrem
   * (se alguem conhecia a senha anterior, perde o acesso). O chamador (BFF)
   * reloga na sequencia para manter a sessao atual viva.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    meta: AuthRequestMeta = {},
  ): Promise<ChangePasswordResult> {
    const user = await this.userRepository.findById(userId);

    // Mesma defesa de timing do login: verifica sempre, mesmo sem usuario.
    const currentOk = await this.passwordHasher.verify(
      currentPassword,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || user.status !== 'active' || !currentOk) {
      if (user) {
        await this.audit(user.tenantId, user.id, 'auth.password_change.failure', {}, meta);
      }
      return { ok: false, reason: 'invalid_current_password' };
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, reason: 'weak_password' };
    }

    await this.userRepository.update(user.id, {
      passwordHash: await this.passwordHasher.hash(newPassword),
      mustChangePassword: false,
    });
    await this.refreshTokenService.revokeAllForUser(user.id);
    await this.audit(user.tenantId, user.id, 'auth.password_changed', {}, meta);
    return { ok: true };
  }

  private async audit(
    tenantId: string,
    actorUserId: string | null,
    action: string,
    metadata: Record<string, unknown>,
    meta: AuthRequestMeta,
  ): Promise<void> {
    await this.auditLogRepository.record({
      tenantId,
      actorUserId: actorUserId ?? undefined,
      action,
      metadata,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
