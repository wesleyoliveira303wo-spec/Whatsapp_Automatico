import { Logger } from '../../../shared/domain/Logger';
import { UserRepository } from '../domain/repositories/UserRepository';
import { AuditLogRepository } from '../domain/repositories/AuditLogRepository';
import { PasswordHasher } from '../domain/PasswordHasher';
import { AccessTokenService } from '../domain/AccessTokenService';
import { RefreshTokenService } from './RefreshTokenService';
import { PublicUser, toPublicUser } from '../domain/entities/User';
import { MIN_PASSWORD_LENGTH } from '../domain/passwordPolicy';
import { AccountLockout } from '../domain/AccountLockout';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';

/** Metadados de origem da requisicao (so diagnostico/auditoria). */
export interface AuthRequestMeta {
  userAgent?: string;
  ip?: string;
}

/**
 * Resultado do login — uniao discriminada. No caminho de FALHA,
 * deliberadamente generico (sem dizer se foi email ou senha) para nao
 * permitir enumeracao de usuarios.
 *
 * Bloco B1 — `reason: 'account_locked'` e a primeira excecao a essa
 * genericidade, e nao vaza existencia: o lockout conta o e-mail TENTADO,
 * exista ele ou nao (ver `AccountLockout`), entao receber "bloqueada" nao
 * prova que a conta existe. `reason` e OPCIONAL de proposito — todo
 * `return { ok: false }` ja escrito continua valido.
 *
 * Painel /admin, Fase 4 — `reason: 'tenant_suspended'` e a segunda excecao.
 * So e devolvido DEPOIS de a senha bater (mesma ordem de `account_locked`):
 * quem nao tem a senha nunca consegue sondar se um tenant esta suspenso. Nao
 * vaza existencia de USUARIO — a suspensao e do tenant inteiro, independe de
 * qual usuario tentou.
 */
export type LoginResult =
  | { ok: true; accessToken: string; refreshToken: string; user: PublicUser }
  | { ok: false; reason?: 'account_locked' | 'tenant_suspended'; retryAfterMs?: number };

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
    /**
     * Bloco B1 — OPCIONAL (mesmo padrao das demais dependencias auxiliares
     * deste projeto): ausente, o comportamento e exatamente o de antes do
     * bloco, sem lockout nenhum. Presente, conta falhas por e-mail tentado.
     */
    private readonly accountLockout?: AccountLockout,
    /**
     * Painel /admin, Fase 4 — OPCIONAL (mesmo padrão das demais dependências
     * auxiliares). Ausente, nenhuma checagem de suspensão de tenant acontece
     * (comportamento pré-Fase 4). Presente, `login`/`refresh` recusam um
     * tenant `status: 'suspended'` DEPOIS de validar as credenciais.
     */
    private readonly tenantRepository?: TenantRepository,
  ) {}

  async login(
    tenantId: string,
    email: string,
    password: string,
    meta: AuthRequestMeta = {},
  ): Promise<LoginResult> {
    // Antes de qualquer trabalho: conta bloqueada nao gasta scrypt nem
    // consulta ao banco. `peek` nao conta como tentativa.
    const lockout = await this.accountLockout?.status(email);
    if (lockout?.locked) {
      await this.audit(tenantId, null, 'auth.login.locked', { email }, meta);
      return { ok: false, reason: 'account_locked', retryAfterMs: lockout.retryAfterMs };
    }

    const user = await this.userRepository.findByTenantAndEmail(tenantId, email);

    // Timing: verifica sempre (contra o hash real, ou contra a isca) para que
    // "usuario inexistente" e "senha errada" levem tempos parecidos.
    const passwordOk = await this.passwordHasher.verify(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || user.status !== 'active' || !passwordOk) {
      await this.accountLockout?.recordFailure(email);
      await this.audit(tenantId, null, 'auth.login.failure', { email }, meta);
      return { ok: false };
    }

    // Login certo apaga o historico de falhas — quem errou a senha 4 vezes e
    // acertou na quinta nao pode ficar a uma falha do bloqueio.
    await this.accountLockout?.clear(email);

    // Painel /admin, Fase 4 — tenant suspenso nao loga, mesmo com a senha
    // certa. Checado SO aqui (credenciais ja validadas) para nao virar um
    // oraculo de "este tenant esta suspenso" para quem nao tem a senha.
    const tenant = await this.tenantRepository?.findById(user.tenantId);
    if (tenant?.status === 'suspended') {
      await this.audit(tenantId, user.id, 'auth.login.tenant_suspended', {}, meta);
      return { ok: false, reason: 'tenant_suspended' };
    }

    const updated = await this.userRepository.update(user.id, { lastLoginAt: this.now() });
    const accessToken = this.accessTokenService.issue({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    });
    const refreshToken = await this.refreshTokenService.issue(user.id, meta);

    await this.audit(tenantId, user.id, 'auth.login.success', {}, meta);
    return { ok: true, accessToken, refreshToken, user: toPublicUser(updated ?? user) };
  }

  /**
   * Login SEM tenantId (Fase Auth/Registro, 2026-08-26) — resolve o usuario
   * pelo e-mail (unico global desde a migration `20260826210000`) e usa o
   * `tenantId` do PROPRIO usuario encontrado. Mesma logica anti-enumeracao/
   * anti-timing de `login`; nao duplica-la, delega para `login(tenantId,...)`
   * depois de descobrir o tenant. Sem usuario encontrado, ainda roda a
   * verificacao contra o hash-isca (mesmo `login` legado faz isso quando o
   * usuario nao existe) para nao vazar "e-mail existe/nao existe" por timing.
   */
  async loginByEmail(
    email: string,
    password: string,
    meta: AuthRequestMeta = {},
  ): Promise<LoginResult> {
    const lockout = await this.accountLockout?.status(email);
    if (lockout?.locked) {
      // Sem tenant resolvido ainda — o bloqueio e por e-mail, nao por conta,
      // justamente para nao depender de o usuario existir.
      return { ok: false, reason: 'account_locked', retryAfterMs: lockout.retryAfterMs };
    }

    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      // Sem tenant real para auditar (AuditLog tem FK para Tenant) — so a
      // defesa de timing roda aqui; a falha em si nao gera log.
      await this.passwordHasher.verify(password, DUMMY_PASSWORD_HASH);
      // Conta a falha MESMO sem usuario: e isto que impede a resposta de
      // bloqueio de virar um oraculo de "este e-mail existe" (ver
      // `AccountLockout`). `login` nunca e alcancado neste ramo, entao o
      // registro precisa acontecer aqui.
      await this.accountLockout?.recordFailure(email);
      return { ok: false };
    }
    return this.login(user.tenantId, email, password, meta);
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

    // Painel /admin, Fase 4 — tenant suspenso depois do token ser emitido:
    // derruba a sessao inteira, mesmo tratamento de usuario suspenso.
    const tenant = await this.tenantRepository?.findById(user.tenantId);
    if (tenant?.status === 'suspended') {
      await this.refreshTokenService.revokeAllForUser(rotated.userId);
      return { ok: false };
    }

    const accessToken = this.accessTokenService.issue({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    });
    return { ok: true, accessToken, refreshToken: rotated.token };
  }

  /**
   * `actorUserId` e OPCIONAL (Fase Auth, 2026-08-26 — R5 da auditoria): o
   * logout so precisa do refresh token para revogar (`revoke` acha pelo
   * HASH, nao pelo dono) — exigir um access token AINDA VALIDO era uma
   * barreira desnecessaria que, se o access token ja tivesse expirado,
   * deixava o refresh token (ate 7 dias) intacto e o erro passava em
   * silencio no BFF. Sem `actorUserId`, so o refresh token e revogado; a
   * auditoria fica sem o autor identificado (ainda registra o evento).
   */
  async logout(
    tenantId: string,
    actorUserId: string | null,
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
   * Edita o PROPRIO nome/foto (Reorganizacao Perfil/Configuracoes,
   * 2026-08-27) — nunca `email`/`role`/`status` (identidade e RBAC nao se
   * editam por aqui; isso continua exclusivo do RH, `UserManagementService`).
   * `name`/`avatarUrl` ausentes no input mantem o valor atual; string vazia
   * limpa o campo (`undefined` explicito no `UserUpdate`).
   */
  async updateProfile(
    userId: string,
    changes: { name?: string; avatarUrl?: string },
  ): Promise<PublicUser | null> {
    const update: { name?: string; avatarUrl?: string } = {};
    if (changes.name !== undefined) update.name = changes.name.trim();
    if (changes.avatarUrl !== undefined) update.avatarUrl = changes.avatarUrl.trim();

    const user = await this.userRepository.update(userId, update);
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
