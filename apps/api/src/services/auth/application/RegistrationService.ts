import type { PrismaClient } from '@prisma/client';

import { Logger } from '../../../shared/domain/Logger';
import { PasswordHasher } from '../domain/PasswordHasher';
import { AccessTokenService } from '../domain/AccessTokenService';
import { RefreshTokenService } from './RefreshTokenService';
import { AuditLogRepository } from '../domain/repositories/AuditLogRepository';
import { PublicUser, toPublicUser, User } from '../domain/entities/User';
import { MIN_PASSWORD_LENGTH } from '../domain/passwordPolicy';
import { AuthRequestMeta } from './AuthService';

export type RegisterResult =
  | { ok: true; accessToken: string; refreshToken: string; user: PublicUser; tenantId: string }
  | { ok: false; reason: 'email_in_use' | 'weak_password' | 'invalid_input' };

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  companyName: string;
}

/**
 * Registro self-service: Tenant + Owner numa unica operacao — Fase
 * Auth/Registro (2026-08-26). Antes disso, criar um tenant era SQL manual
 * (nenhum caminho de codigo existia — achado da auditoria).
 *
 * ATOMICO via `prisma.$transaction`: se a criacao do usuario falhar (ex.:
 * corrida rara de e-mail duplicado — a unica FK/unique que pode falhar aqui,
 * ja que o Tenant nao tem unicidade nenhuma), o Tenant criado no mesmo
 * `$transaction` e desfeito junto — nunca fica um tenant orfao sem owner.
 * Usa o `PrismaClient` diretamente (nao os repositorios `TenantRepository`/
 * `UserRepository`) porque a atomicidade cruza duas entidades de bounded
 * contexts "shared"/"auth" distintos — nenhum dos dois repositorios sozinho
 * expoe uma transacao cross-entity; mesma excecao pragmatica ja aceita em
 * outros pontos do projeto (ex.: leituras cruzadas de relatorio em
 * `PrismaAnalyticsRepository`).
 *
 * `name` (nome da pessoa) passou a ter coluna propria em `User` a partir da
 * Reorganizacao Perfil/Configuracoes (2026-08-27) — antes so ia para a
 * auditoria (`AuditLog.metadata`), nunca persistido de fato.
 */
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokenService: AccessTokenService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly logger: Logger,
  ) {}

  async register(input: RegisterInput, meta: AuthRequestMeta = {}): Promise<RegisterResult> {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const companyName = input.companyName.trim();

    if (name === '' || companyName === '' || email === '') {
      return { ok: false, reason: 'invalid_input' };
    }
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, reason: 'weak_password' };
    }

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return { ok: false, reason: 'email_in_use' };
    }

    const passwordHash = await this.passwordHasher.hash(input.password);

    let created: { tenantId: string; user: User };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({ data: { name: companyName } });
        const userRow = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email,
            passwordHash,
            role: 'OWNER',
            status: 'ACTIVE',
            mustChangePassword: false,
            name,
          },
        });
        const user: User = {
          id: userRow.id,
          tenantId: userRow.tenantId,
          email: userRow.email,
          passwordHash: userRow.passwordHash,
          role: 'owner',
          status: 'active',
          mustChangePassword: false,
          name: userRow.name ?? undefined,
          createdAt: userRow.createdAt,
          updatedAt: userRow.updatedAt,
        };
        return { tenantId: tenant.id, user };
      });
    } catch (error) {
      // Corrida rara: dois registros com o mesmo e-mail entre o check acima e
      // o commit da transacao. `existing` ja cobre o caso comum; isto so
      // pega a janela de corrida (unique constraint do Postgres).
      this.logger.warn('Falha ao registrar tenant+owner', { error: (error as Error).message });
      return { ok: false, reason: 'email_in_use' };
    }

    const accessToken = this.accessTokenService.issue({
      userId: created.user.id,
      tenantId: created.tenantId,
      role: created.user.role,
      mustChangePassword: false,
    });
    const refreshToken = await this.refreshTokenService.issue(created.user.id, meta);

    await this.auditLogRepository.record({
      tenantId: created.tenantId,
      actorUserId: created.user.id,
      action: 'auth.register',
      metadata: { name, email },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      ok: true,
      accessToken,
      refreshToken,
      user: toPublicUser(created.user),
      tenantId: created.tenantId,
    };
  }
}
