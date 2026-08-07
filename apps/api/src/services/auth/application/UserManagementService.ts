import { Logger } from '../../../shared/domain/Logger';
import { PublicUser, toPublicUser, User, UserRole } from '../domain/entities/User';
import { outranks } from '../domain/permissions';
import {
  EmailAlreadyInUseError,
  RoleNotAllowedError,
  SelfManagementError,
  UserNotFoundError,
  WeakTemporaryPasswordError,
} from '../domain/errors/userManagementErrors';
import { ListUsersOptions, UserRepository } from '../domain/repositories/UserRepository';
import { MIN_PASSWORD_LENGTH } from '../domain/passwordPolicy';
import { RefreshTokenRepository } from '../domain/repositories/RefreshTokenRepository';
import { AuditLogRepository } from '../domain/repositories/AuditLogRepository';
import { PasswordHasher } from '../domain/PasswordHasher';
import { AuthRequestMeta } from './AuthService';

/**
 * Quem esta executando a acao de gestao. SEMPRE um usuario humano com cargo —
 * o plano maquina (API key) nao gerencia usuarios (decisao de Presentation no
 * M5E-3; este service simplesmente exige um ator com cargo).
 */
export interface UserManagementActor {
  userId: string;
  role: UserRole;
}

/** Dados para criar um usuario. A senha aqui e a PROVISORIA (o proprio usuario troca no primeiro login — D64). */
export interface CreateUserInput {
  email: string;
  role: UserRole;
  temporaryPassword: string;
}

/** Pagina de usuarios "publicos" (sem hash de senha) devolvida pela listagem. */
export interface PublicUserPage {
  users: PublicUser[];
  nextCursor?: string;
}

/** Tamanho minimo da senha provisoria — a MESMA politica da senha definitiva (`domain/passwordPolicy.ts`, M5F-2). */
const MIN_TEMPORARY_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;

/**
 * Application Service de gestao de usuarios (o "RH") — Milestone 5, Bloco
 * M5E-2. Orquestra criar/listar/promover/suspender/reativar/resetar senha,
 * aplicando as regras de hierarquia aprovadas:
 *
 * 1. So se gerencia quem esta ESTRITAMENTE ABAIXO na hierarquia (`outranks`),
 *    tanto o cargo-alvo atual quanto o cargo de destino. Consequencias:
 *    administrator nao cria/mexe em administrator; ninguem cria owner; owner
 *    nunca e suspenso por aqui (nada outranks owner) — o invariante "sempre
 *    ha um owner ativo" decorre da regra, sem checagem extra.
 * 2. Ninguem age sobre a PROPRIA conta por este service (auto-suspensao,
 *    auto-rebaixamento, auto-reset) — trocar a propria senha e outro caso de
 *    uso (M5F), com verificacao da senha atual.
 * 3. Suspensao e reset de senha REVOGAM todos os refresh tokens do alvo: a
 *    pessoa cai na proxima renovacao de cracha (<= TTL do access token, 15
 *    min). Mudanca de cargo NAO revoga: o refresh reemite o cracha lendo o
 *    cargo atual do banco (AuthService.refresh), entao o cargo novo vale no
 *    maximo apos 1 TTL — mesmo compromisso de latencia aceito no SSE (ADR #50).
 * 4. Toda acao e AUDITADA (targetType 'user'), mesmo padrao de Conversas e
 *    Sessoes. Senhas NUNCA aparecem na auditoria (nem hasheadas).
 *
 * Nenhuma dependencia de HTTP/Prisma — testavel com os Fakes do M5A.
 */
export class UserManagementService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly logger: Logger,
  ) {}

  async createUser(
    tenantId: string,
    actor: UserManagementActor,
    input: CreateUserInput,
    meta: AuthRequestMeta = {},
  ): Promise<PublicUser> {
    if (!outranks(actor.role, input.role)) {
      throw new RoleNotAllowedError(
        `Cargo '${actor.role}' nao pode criar usuario com cargo '${input.role}'`,
      );
    }
    if (input.temporaryPassword.length < MIN_TEMPORARY_PASSWORD_LENGTH) {
      throw new WeakTemporaryPasswordError(MIN_TEMPORARY_PASSWORD_LENGTH);
    }

    const email = normalizeEmail(input.email);
    const existing = await this.userRepository.findByTenantAndEmail(tenantId, email);
    if (existing) {
      throw new EmailAlreadyInUseError(email);
    }

    const created = await this.userRepository.create({
      tenantId,
      email,
      passwordHash: await this.passwordHasher.hash(input.temporaryPassword),
      role: input.role,
      status: 'active',
      mustChangePassword: true,
    });

    this.logger.info('Usuario criado', { tenantId, userId: created.id, role: created.role });
    await this.audit(
      tenantId,
      actor,
      'user.created',
      created.id,
      { email, role: created.role },
      meta,
    );
    return toPublicUser(created);
  }

  /** Listagem e leitura pura: sem regra de hierarquia (quem tem `user:read` ve a equipe toda do proprio tenant), sem auditoria. */
  async listUsers(tenantId: string, options: ListUsersOptions): Promise<PublicUserPage> {
    const page = await this.userRepository.listByTenant(tenantId, options);
    return { users: page.users.map(toPublicUser), nextCursor: page.nextCursor };
  }

  async changeRole(
    tenantId: string,
    actor: UserManagementActor,
    targetUserId: string,
    newRole: UserRole,
    meta: AuthRequestMeta = {},
  ): Promise<PublicUser> {
    const target = await this.findTargetOrThrow(tenantId, targetUserId);
    if (target.id === actor.userId) {
      throw new SelfManagementError('alterar o proprio cargo');
    }
    if (!outranks(actor.role, target.role) || !outranks(actor.role, newRole)) {
      throw new RoleNotAllowedError(
        `Cargo '${actor.role}' nao pode mover usuario de '${target.role}' para '${newRole}'`,
      );
    }

    const updated = await this.userRepository.update(target.id, { role: newRole });
    if (!updated) {
      throw new UserNotFoundError(targetUserId);
    }

    await this.audit(
      tenantId,
      actor,
      'user.role_changed',
      target.id,
      { from: target.role, to: newRole },
      meta,
    );
    return toPublicUser(updated);
  }

  async suspendUser(
    tenantId: string,
    actor: UserManagementActor,
    targetUserId: string,
    meta: AuthRequestMeta = {},
  ): Promise<PublicUser> {
    const target = await this.findTargetOrThrow(tenantId, targetUserId);
    if (target.id === actor.userId) {
      throw new SelfManagementError('suspender a propria conta');
    }
    if (!outranks(actor.role, target.role)) {
      throw new RoleNotAllowedError(
        `Cargo '${actor.role}' nao pode suspender usuario com cargo '${target.role}'`,
      );
    }

    const updated = await this.userRepository.update(target.id, { status: 'suspended' });
    if (!updated) {
      throw new UserNotFoundError(targetUserId);
    }

    // Derruba as "chaves reserva": sem refresh token, o acesso morre quando o
    // cracha atual expirar (<= 15 min) — nao existe sessao viva indefinida.
    await this.refreshTokenRepository.revokeAllByUser(target.id);

    await this.audit(tenantId, actor, 'user.suspended', target.id, {}, meta);
    return toPublicUser(updated);
  }

  async reactivateUser(
    tenantId: string,
    actor: UserManagementActor,
    targetUserId: string,
    meta: AuthRequestMeta = {},
  ): Promise<PublicUser> {
    const target = await this.findTargetOrThrow(tenantId, targetUserId);
    if (!outranks(actor.role, target.role)) {
      throw new RoleNotAllowedError(
        `Cargo '${actor.role}' nao pode reativar usuario com cargo '${target.role}'`,
      );
    }

    const updated = await this.userRepository.update(target.id, { status: 'active' });
    if (!updated) {
      throw new UserNotFoundError(targetUserId);
    }

    await this.audit(tenantId, actor, 'user.reactivated', target.id, {}, meta);
    return toPublicUser(updated);
  }

  async resetPassword(
    tenantId: string,
    actor: UserManagementActor,
    targetUserId: string,
    temporaryPassword: string,
    meta: AuthRequestMeta = {},
  ): Promise<PublicUser> {
    const target = await this.findTargetOrThrow(tenantId, targetUserId);
    if (target.id === actor.userId) {
      throw new SelfManagementError('resetar a propria senha');
    }
    if (!outranks(actor.role, target.role)) {
      throw new RoleNotAllowedError(
        `Cargo '${actor.role}' nao pode resetar a senha de cargo '${target.role}'`,
      );
    }
    if (temporaryPassword.length < MIN_TEMPORARY_PASSWORD_LENGTH) {
      throw new WeakTemporaryPasswordError(MIN_TEMPORARY_PASSWORD_LENGTH);
    }

    const updated = await this.userRepository.update(target.id, {
      passwordHash: await this.passwordHasher.hash(temporaryPassword),
      mustChangePassword: true,
    });
    if (!updated) {
      throw new UserNotFoundError(targetUserId);
    }

    // Mesmo racional da suspensao: senha resetada = sessoes antigas invalidas.
    await this.refreshTokenRepository.revokeAllByUser(target.id);

    await this.audit(tenantId, actor, 'user.password_reset', target.id, {}, meta);
    return toPublicUser(updated);
  }

  /**
   * Busca o alvo e valida que pertence ao tenant do ator. Alvo de outro tenant
   * e reportado como NAO ENCONTRADO (nao "proibido") de proposito: nao vaza a
   * existencia de usuarios de outras empresas — mesma defesa do login generico.
   */
  private async findTargetOrThrow(tenantId: string, targetUserId: string): Promise<User> {
    const target = await this.userRepository.findById(targetUserId);
    if (!target || target.tenantId !== tenantId) {
      throw new UserNotFoundError(targetUserId);
    }
    return target;
  }

  private async audit(
    tenantId: string,
    actor: UserManagementActor,
    action: string,
    targetUserId: string,
    metadata: Record<string, unknown>,
    meta: AuthRequestMeta,
  ): Promise<void> {
    await this.auditLogRepository.record({
      tenantId,
      actorUserId: actor.userId,
      action,
      targetType: 'user',
      targetId: targetUserId,
      metadata,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}

/** Email canonico: sem espacos acidentais e caixa baixa — "Joao@Empresa.com " e "joao@empresa.com" sao a MESMA conta. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
