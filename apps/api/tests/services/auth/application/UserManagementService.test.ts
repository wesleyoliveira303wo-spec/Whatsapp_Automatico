import { randomUUID } from 'crypto';

import {
  UserManagementActor,
  UserManagementService,
} from '../../../../src/services/auth/application/UserManagementService';
import {
  EmailAlreadyInUseError,
  RoleNotAllowedError,
  SelfManagementError,
  UserNotFoundError,
  WeakTemporaryPasswordError,
} from '../../../../src/services/auth/domain/errors/userManagementErrors';
import { User, UserRole } from '../../../../src/services/auth/domain/entities/User';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import {
  FakeAuditLogRepository,
  FakePasswordHasher,
  FakeRefreshTokenRepository,
  FakeUserRepository,
} from '../testDoubles';

/**
 * Testes do UserManagementService (Milestone 5, Bloco M5E-2) — as regras do
 * "RH": hierarquia estrita, nada de auto-gestao, senha provisoria com troca
 * obrigatoria, revogacao de sessoes e auditoria. Tudo com Fakes (sem Prisma).
 */
interface ServiceUnderTest {
  service: UserManagementService;
  users: FakeUserRepository;
  refreshTokens: FakeRefreshTokenRepository;
  audit: FakeAuditLogRepository;
}

function buildService(): ServiceUnderTest {
  const users = new FakeUserRepository();
  const refreshTokens = new FakeRefreshTokenRepository();
  const audit = new FakeAuditLogRepository();
  const hasher = new FakePasswordHasher();
  const service = new UserManagementService(users, refreshTokens, audit, hasher, new NoopLogger());
  return { service, users, refreshTokens, audit };
}

function buildUser(overrides: Partial<User> = {}): User {
  const now = new Date();
  return {
    id: randomUUID(),
    tenantId: 'tenant-1',
    email: `${randomUUID()}@empresa.com`,
    passwordHash: 'hashed:senha',
    role: 'operator',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function actorOf(role: UserRole, userId = randomUUID()): UserManagementActor {
  return { userId, role };
}

describe('UserManagementService — criar usuario (Milestone 5, Bloco M5E-2)', () => {
  it('cria com senha provisoria hasheada, mustChangePassword: true e SEM passwordHash na resposta', async () => {
    const { service, users, audit } = buildService();

    const created = await service.createUser('tenant-1', actorOf('owner'), {
      email: 'maria@empresa.com',
      role: 'operator',
      temporaryPassword: 'senha-provisoria',
    });

    expect(created.mustChangePassword).toBe(true);
    expect((created as Record<string, unknown>).passwordHash).toBeUndefined();

    const stored = await users.findByTenantAndEmail('tenant-1', 'maria@empresa.com');
    expect(stored?.passwordHash).toBe('hashed:senha-provisoria');

    expect(audit.all()).toEqual([
      expect.objectContaining({ action: 'user.created', targetType: 'user', targetId: created.id }),
    ]);
  });

  it('normaliza o email (trim + caixa baixa) antes de gravar e de checar duplicidade', async () => {
    const { service, users } = buildService();

    await service.createUser('tenant-1', actorOf('owner'), {
      email: '  Maria@Empresa.COM ',
      role: 'operator',
      temporaryPassword: 'senha-provisoria',
    });

    expect(await users.findByTenantAndEmail('tenant-1', 'maria@empresa.com')).not.toBeNull();
  });

  it('recusa email ja usado no MESMO tenant (EmailAlreadyInUseError), mas permite em outro tenant', async () => {
    const { service, users } = buildService();
    users.seed(buildUser({ tenantId: 'tenant-1', email: 'maria@empresa.com' }));

    await expect(
      service.createUser('tenant-1', actorOf('owner'), {
        email: 'maria@empresa.com',
        role: 'operator',
        temporaryPassword: 'senha-provisoria',
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError);

    await expect(
      service.createUser('tenant-2', actorOf('owner'), {
        email: 'maria@empresa.com',
        role: 'operator',
        temporaryPassword: 'senha-provisoria',
      }),
    ).resolves.toMatchObject({ tenantId: 'tenant-2' });
  });

  it('administrator NAO cria administrator (cargo igual) nem owner (acima) — RoleNotAllowedError', async () => {
    const { service } = buildService();
    const admin = actorOf('administrator');

    for (const role of ['administrator', 'owner'] as const) {
      await expect(
        service.createUser('tenant-1', admin, {
          email: 'x@y.com',
          role,
          temporaryPassword: 'senha-provisoria',
        }),
      ).rejects.toBeInstanceOf(RoleNotAllowedError);
    }
  });

  it('administrator cria manager/operator/read_only (abaixo dele)', async () => {
    const { service } = buildService();
    const admin = actorOf('administrator');

    for (const role of ['manager', 'operator', 'read_only'] as const) {
      await expect(
        service.createUser('tenant-1', admin, {
          email: `${role}@empresa.com`,
          role,
          temporaryPassword: 'senha-provisoria',
        }),
      ).resolves.toMatchObject({ role });
    }
  });

  it('recusa senha provisoria com menos de 8 caracteres (WeakTemporaryPasswordError)', async () => {
    const { service } = buildService();

    await expect(
      service.createUser('tenant-1', actorOf('owner'), {
        email: 'x@y.com',
        role: 'operator',
        temporaryPassword: '1234567',
      }),
    ).rejects.toBeInstanceOf(WeakTemporaryPasswordError);
  });
});

describe('UserManagementService — listagem', () => {
  it('devolve PublicUser (sem passwordHash) e repassa o cursor do repositorio', async () => {
    const { service, users } = buildService();
    users.seed(buildUser({ tenantId: 'tenant-1' }));
    users.seed(buildUser({ tenantId: 'tenant-1' }));
    users.seed(buildUser({ tenantId: 'tenant-2' }));

    const page = await service.listUsers('tenant-1', { limit: 1 });

    expect(page.users).toHaveLength(1);
    expect(page.nextCursor).toBeDefined();
    expect((page.users[0] as Record<string, unknown>).passwordHash).toBeUndefined();
  });
});

describe('UserManagementService — mudanca de cargo', () => {
  it('owner promove operator a manager, audita from/to', async () => {
    const { service, users, audit } = buildService();
    const target = buildUser({ role: 'operator' });
    users.seed(target);

    const updated = await service.changeRole('tenant-1', actorOf('owner'), target.id, 'manager');

    expect(updated.role).toBe('manager');
    expect(audit.all()).toEqual([
      expect.objectContaining({
        action: 'user.role_changed',
        metadata: { from: 'operator', to: 'manager' },
      }),
    ]);
  });

  it('ninguem altera o PROPRIO cargo (SelfManagementError)', async () => {
    const { service, users } = buildService();
    const target = buildUser({ role: 'administrator' });
    users.seed(target);

    await expect(
      service.changeRole(
        'tenant-1',
        { userId: target.id, role: 'administrator' },
        target.id,
        'owner',
      ),
    ).rejects.toBeInstanceOf(SelfManagementError);
  });

  it('administrator NAO promove manager a administrator (destino nao esta abaixo do ator)', async () => {
    const { service, users } = buildService();
    const target = buildUser({ role: 'manager' });
    users.seed(target);

    await expect(
      service.changeRole('tenant-1', actorOf('administrator'), target.id, 'administrator'),
    ).rejects.toBeInstanceOf(RoleNotAllowedError);
  });

  it('manager NAO mexe em administrator (alvo acima do ator)', async () => {
    const { service, users } = buildService();
    const target = buildUser({ role: 'administrator' });
    users.seed(target);

    await expect(
      service.changeRole('tenant-1', actorOf('manager'), target.id, 'read_only'),
    ).rejects.toBeInstanceOf(RoleNotAllowedError);
  });

  it('alvo inexistente OU de outro tenant = UserNotFoundError (indistinguiveis, sem vazamento entre tenants)', async () => {
    const { service, users } = buildService();
    const otherTenantUser = buildUser({ tenantId: 'tenant-2', role: 'operator' });
    users.seed(otherTenantUser);

    await expect(
      service.changeRole('tenant-1', actorOf('owner'), 'nao-existe', 'manager'),
    ).rejects.toBeInstanceOf(UserNotFoundError);
    await expect(
      service.changeRole('tenant-1', actorOf('owner'), otherTenantUser.id, 'manager'),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('UserManagementService — suspensao e reativacao', () => {
  it('suspende, REVOGA todos os refresh tokens do alvo e audita', async () => {
    const { service, users, refreshTokens, audit } = buildService();
    const target = buildUser({ role: 'operator' });
    users.seed(target);
    await refreshTokens.create({
      userId: target.id,
      tokenHash: 'h1',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await refreshTokens.create({
      userId: target.id,
      tokenHash: 'h2',
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const updated = await service.suspendUser('tenant-1', actorOf('administrator'), target.id);

    expect(updated.status).toBe('suspended');
    expect(refreshTokens.all().every((t) => t.revokedAt !== undefined)).toBe(true);
    expect(audit.all()).toEqual([
      expect.objectContaining({ action: 'user.suspended', targetId: target.id }),
    ]);
  });

  it('ninguem se auto-suspende (SelfManagementError)', async () => {
    const { service, users } = buildService();
    const target = buildUser({ role: 'administrator' });
    users.seed(target);

    await expect(
      service.suspendUser('tenant-1', { userId: target.id, role: 'administrator' }, target.id),
    ).rejects.toBeInstanceOf(SelfManagementError);
  });

  it('owner NUNCA e suspenso (nada outranks owner) — invariante "sempre ha um dono ativo"', async () => {
    const { service, users } = buildService();
    const ownerUser = buildUser({ role: 'owner' });
    users.seed(ownerUser);

    await expect(
      service.suspendUser('tenant-1', actorOf('owner'), ownerUser.id),
    ).rejects.toBeInstanceOf(RoleNotAllowedError);
  });

  it('reativa um suspenso e audita', async () => {
    const { service, users, audit } = buildService();
    const target = buildUser({ role: 'operator', status: 'suspended' });
    users.seed(target);

    const updated = await service.reactivateUser('tenant-1', actorOf('manager'), target.id);

    expect(updated.status).toBe('active');
    expect(audit.all()).toEqual([
      expect.objectContaining({ action: 'user.reactivated', targetId: target.id }),
    ]);
  });
});

describe('UserManagementService — reset de senha', () => {
  it('troca o hash, liga mustChangePassword, revoga refresh tokens e audita SEM expor a senha', async () => {
    const { service, users, refreshTokens, audit } = buildService();
    const target = buildUser({ role: 'operator', passwordHash: 'hashed:antiga' });
    users.seed(target);
    await refreshTokens.create({
      userId: target.id,
      tokenHash: 'h1',
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const updated = await service.resetPassword(
      'tenant-1',
      actorOf('administrator'),
      target.id,
      'nova-provisoria',
    );

    expect(updated.mustChangePassword).toBe(true);
    expect((await users.findById(target.id))?.passwordHash).toBe('hashed:nova-provisoria');
    expect(refreshTokens.all()[0].revokedAt).toBeDefined();

    const entry = audit.all()[0];
    expect(entry.action).toBe('user.password_reset');
    expect(JSON.stringify(entry.metadata)).not.toContain('nova-provisoria');
  });

  it('ninguem reseta a PROPRIA senha por aqui (SelfManagementError) — troca propria e outro fluxo', async () => {
    const { service, users } = buildService();
    const target = buildUser({ role: 'administrator' });
    users.seed(target);

    await expect(
      service.resetPassword(
        'tenant-1',
        { userId: target.id, role: 'administrator' },
        target.id,
        'nova-provisoria',
      ),
    ).rejects.toBeInstanceOf(SelfManagementError);
  });

  it('recusa senha provisoria fraca no reset (WeakTemporaryPasswordError)', async () => {
    const { service, users } = buildService();
    const target = buildUser({ role: 'operator' });
    users.seed(target);

    await expect(
      service.resetPassword('tenant-1', actorOf('owner'), target.id, 'curta'),
    ).rejects.toBeInstanceOf(WeakTemporaryPasswordError);
  });
});
