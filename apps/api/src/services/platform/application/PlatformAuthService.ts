import { Logger } from '../../../shared/domain/Logger';
import { PasswordHasher } from '../../auth/domain/PasswordHasher';
import { AccountLockout } from '../../auth/domain/AccountLockout';
import { PlatformUserRepository } from '../domain/repositories/PlatformUserRepository';
import { PlatformAuditLogRepository } from '../domain/repositories/PlatformAuditLogRepository';
import { PublicPlatformUser, toPublicPlatformUser } from '../domain/entities/PlatformUser';
import { InvalidPlatformCredentialsError } from '../domain/errors/InvalidPlatformCredentialsError';
import { PlatformAccountLockedError } from '../domain/errors/PlatformAccountLockedError';

/** Contexto da requisição, só para a trilha — nunca influencia a decisão de login. */
export interface PlatformRequestMeta {
  ip?: string;
  userAgent?: string;
}

/**
 * Login do `/admin` — Fase 1 (`ADMIN_PLATFORM_MASTER_PLAN.md` §15).
 *
 * Reaproveita, sem reescrever, três peças já testadas de `services/auth`: o
 * `PasswordHasher` (scrypt), a `AccountLockout` e o `RateLimitStore` por trás
 * dela (Bloco B1). O que muda é só o repositório e a trilha — o `/admin` é a
 * superfície mais sensível do sistema e não é lugar para uma segunda
 * implementação de autenticação, que envelheceria em paralelo com a primeira.
 *
 * Duas garantias que o código sustenta, não a disciplina:
 *
 * 1. **Não vaza quais e-mails são admin.** E-mail inexistente e senha errada
 *    devolvem o MESMO erro, e ambos gastam uma tentativa da trava. Sem isso, a
 *    diferença de resposta responderia "esse e-mail é administrador?" a quem
 *    perguntasse.
 * 2. **Toda tentativa é auditada** — inclusive a que falha. Uma sequência de
 *    `platform.login_failed` é exatamente o que se quer enxergar depois.
 */
export class PlatformAuthService {
  constructor(
    private readonly platformUserRepository: PlatformUserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly auditLog: PlatformAuditLogRepository,
    private readonly logger: Logger,
    /**
     * Trava por conta (Bloco B1). Opcional só para o teste conseguir montar o
     * serviço sem ela; em produção o composition root sempre injeta.
     */
    private readonly accountLockout?: AccountLockout,
  ) {}

  /**
   * Devolve o admin quando a credencial confere. Lança
   * `PlatformAccountLockedError` (423) se a conta está trancada e
   * `InvalidPlatformCredentialsError` (401) em qualquer outra falha.
   */
  async login(
    email: string,
    password: string,
    meta: PlatformRequestMeta = {},
  ): Promise<PublicPlatformUser> {
    // Normalização num lugar só — o repositório recebe o e-mail já pronto.
    const normalizedEmail = email.trim().toLowerCase();

    // A trava vem ANTES de qualquer consulta: conta trancada não deve nem
    // custar uma ida ao banco, e o hash de senha é deliberadamente lento.
    if (this.accountLockout) {
      const lock = await this.accountLockout.status(normalizedEmail);
      if (lock.locked) {
        await this.recordFailure(normalizedEmail, 'account_locked', meta);
        throw new PlatformAccountLockedError(lock.retryAfterMs);
      }
    }

    const user = await this.platformUserRepository.findByEmail(normalizedEmail);

    // E-mail inexistente TAMBÉM gasta uma tentativa da trava. Sem isso, um
    // atacante distinguiria "não existe" (rápido, sem trava) de "existe, senha
    // errada" (lento, com trava) — e a trava viraria o oráculo que ela deveria
    // impedir.
    if (!user) {
      await this.accountLockout?.recordFailure(normalizedEmail);
      await this.recordFailure(normalizedEmail, 'unknown_email', meta);
      throw new InvalidPlatformCredentialsError();
    }

    if (user.status !== 'active') {
      await this.accountLockout?.recordFailure(normalizedEmail);
      await this.recordFailure(normalizedEmail, 'account_suspended', meta, user.id);
      throw new InvalidPlatformCredentialsError();
    }

    const passwordMatches = await this.passwordHasher.verify(password, user.passwordHash);
    if (!passwordMatches) {
      await this.accountLockout?.recordFailure(normalizedEmail);
      await this.recordFailure(normalizedEmail, 'wrong_password', meta, user.id);
      throw new InvalidPlatformCredentialsError();
    }

    await this.accountLockout?.clear(normalizedEmail);

    // Último acesso é dado auxiliar: uma falha aqui não pode impedir o login.
    try {
      await this.platformUserRepository.touchLastLogin(user.id, new Date());
    } catch (error) {
      this.logger.warn('Falha ao registrar o último acesso do admin da plataforma', {
        platformUserId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await this.audit(user.id, 'platform.login', meta);
    return toPublicPlatformUser(user);
  }

  /** Registra a saída. Nunca lança — sair sempre funciona. */
  async logout(platformUserId: string, meta: PlatformRequestMeta = {}): Promise<void> {
    await this.audit(platformUserId, 'platform.logout', meta);
  }

  /**
   * Quem é o dono desta sessão, conferido contra o banco a cada uso — nunca
   * confiando só no que está dentro do cookie. É essa releitura que faz um
   * admin suspenso perder o acesso na hora, sem esperar o cookie expirar.
   */
  async describe(platformUserId: string): Promise<PublicPlatformUser | null> {
    const user = await this.platformUserRepository.findById(platformUserId);
    if (!user || user.status !== 'active') return null;
    return toPublicPlatformUser(user);
  }

  /**
   * Uma tentativa falha vira trilha mesmo sem admin identificado — daí o
   * `platformUserId` cair para `'desconhecido'`. O e-mail tentado fica no
   * `metadata`, que é o único jeito de enxergar um ataque dirigido depois.
   */
  private async recordFailure(
    attemptedEmail: string,
    reason: string,
    meta: PlatformRequestMeta,
    platformUserId?: string,
  ): Promise<void> {
    await this.audit(platformUserId ?? 'desconhecido', 'platform.login_failed', meta, {
      attemptedEmail,
      reason,
    });
  }

  /**
   * A trilha NUNCA derruba a ação que ela audita — mesmo padrão já usado por
   * `AuditLog` no resto do projeto. Um banco de auditoria fora do ar não pode
   * impedir o dono de entrar no próprio painel.
   */
  private async audit(
    platformUserId: string,
    action: Parameters<PlatformAuditLogRepository['append']>[0]['action'],
    meta: PlatformRequestMeta,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditLog.append({
        platformUserId,
        action,
        metadata,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    } catch (error) {
      this.logger.error('Falha ao gravar a trilha da plataforma', {
        action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
