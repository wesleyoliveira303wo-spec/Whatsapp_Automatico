import { AuthService } from '../../../../src/services/auth/application/AuthService';
import { RefreshTokenService } from '../../../../src/services/auth/application/RefreshTokenService';
import { Sha256RefreshTokenCodec } from '../../../../src/services/auth/infrastructure/Sha256RefreshTokenCodec';
import { Hs256AccessTokenService } from '../../../../src/services/auth/infrastructure/Hs256AccessTokenService';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { User } from '../../../../src/services/auth/domain/entities/User';
import { AccountLockout } from '../../../../src/services/auth/domain/AccountLockout';
import { RateLimitStoreAccountLockout } from '../../../../src/services/auth/infrastructure/RateLimitStoreAccountLockout';
import { InMemoryRateLimitStore } from '../../../../src/shared/infrastructure/rateLimit/InMemoryRateLimitStore';
import {
  FakeUserRepository,
  FakeRefreshTokenRepository,
  FakeAuditLogRepository,
  FakePasswordHasher,
} from '../testDoubles';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';

const SECRET = 'segredo-de-teste-bem-comprido-1234567890';

function buildUser(overrides: Partial<User> = {}): User {
  const now = new Date('2026-07-18T12:00:00Z');
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'joao@empresa.com',
    passwordHash: 'hashed:senha123',
    role: 'operator',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function build(
  accountLockout?: AccountLockout,
  tenantRepository?: FakeTenantRepository,
): {
  service: AuthService;
  users: FakeUserRepository;
  refreshRepo: FakeRefreshTokenRepository;
  audit: FakeAuditLogRepository;
  access: Hs256AccessTokenService;
  tenants?: FakeTenantRepository;
} {
  const users = new FakeUserRepository();
  const refreshRepo = new FakeRefreshTokenRepository();
  const audit = new FakeAuditLogRepository();
  const access = new Hs256AccessTokenService(SECRET, 900);
  const refresh = new RefreshTokenService(
    refreshRepo,
    new Sha256RefreshTokenCodec(),
    7 * 24 * 60 * 60 * 1000,
  );
  const service = new AuthService(
    users,
    new FakePasswordHasher(),
    access,
    refresh,
    audit,
    new NoopLogger(),
    undefined,
    accountLockout,
    tenantRepository,
  );
  return { service, users, refreshRepo, audit, access, tenants: tenantRepository };
}

describe('AuthService (Milestone 5, Bloco M5C)', () => {
  describe('login', () => {
    it('sucesso: devolve cracha valido + cartao de ponto + usuario SEM passwordHash; audita login.success', async () => {
      const { service, users, audit, access } = build();
      users.seed(buildUser());

      const result = await service.login('tenant-1', 'joao@empresa.com', 'senha123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(access.verify(result.accessToken)).toEqual({
          userId: 'user-1',
          tenantId: 'tenant-1',
          role: 'operator',
          mustChangePassword: false,
        });
        expect(result.refreshToken).toBeTruthy();
        expect((result.user as Record<string, unknown>).passwordHash).toBeUndefined();
      }
      expect(
        audit.all().some((e) => e.action === 'auth.login.success' && e.actorUserId === 'user-1'),
      ).toBe(true);
    });

    it('senha errada: ok=false e audita login.failure (sem ator)', async () => {
      const { service, users, audit } = build();
      users.seed(buildUser());

      const result = await service.login('tenant-1', 'joao@empresa.com', 'senha-errada');

      expect(result.ok).toBe(false);
      expect(audit.all().some((e) => e.action === 'auth.login.failure')).toBe(true);
    });

    it('e-mail inexistente: ok=false (nao lanca, nao distingue de senha errada)', async () => {
      const { service } = build();
      const result = await service.login('tenant-1', 'ninguem@empresa.com', 'x');
      expect(result.ok).toBe(false);
    });

    it('usuario suspenso: ok=false mesmo com a senha certa', async () => {
      const { service, users } = build();
      users.seed(buildUser({ status: 'suspended' }));
      const result = await service.login('tenant-1', 'joao@empresa.com', 'senha123');
      expect(result.ok).toBe(false);
    });
  });

  describe('refresh', () => {
    it('sucesso: rotaciona e emite um novo cracha', async () => {
      const { service, users } = build();
      users.seed(buildUser());
      const login = await service.login('tenant-1', 'joao@empresa.com', 'senha123');
      if (!login.ok) throw new Error('login deveria ter dado certo');

      const result = await service.refresh(login.refreshToken);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.refreshToken).not.toBe(login.refreshToken);
        expect(result.accessToken).toBeTruthy();
      }
    });

    it('token invalido: ok=false', async () => {
      const { service } = build();
      const result = await service.refresh('token-que-nunca-existiu');
      expect(result.ok).toBe(false);
    });

    it('usuario suspenso depois do login: refresh falha e derruba a familia de tokens', async () => {
      const { service, users, refreshRepo } = build();
      users.seed(buildUser());
      const login = await service.login('tenant-1', 'joao@empresa.com', 'senha123');
      if (!login.ok) throw new Error('login deveria ter dado certo');
      await users.update('user-1', { status: 'suspended' });

      const result = await service.refresh(login.refreshToken);

      expect(result.ok).toBe(false);
      expect(refreshRepo.all().every((t) => t.revokedAt !== undefined)).toBe(true);
    });
  });

  describe('logout / me', () => {
    it('logout revoga o refresh token e audita', async () => {
      const { service, users, refreshRepo, audit } = build();
      users.seed(buildUser());
      const login = await service.login('tenant-1', 'joao@empresa.com', 'senha123');
      if (!login.ok) throw new Error('login deveria ter dado certo');

      await service.logout('tenant-1', 'user-1', login.refreshToken);

      expect(refreshRepo.all().every((t) => t.revokedAt !== undefined)).toBe(true);
      expect(
        audit.all().some((e) => e.action === 'auth.logout' && e.actorUserId === 'user-1'),
      ).toBe(true);
    });

    it('getMe devolve o usuario publico (sem passwordHash); null quando nao existe', async () => {
      const { service, users } = build();
      users.seed(buildUser());

      const me = await service.getMe('user-1');
      expect(me?.email).toBe('joao@empresa.com');
      expect((me as Record<string, unknown> | null)?.passwordHash).toBeUndefined();

      expect(await service.getMe('nope')).toBeNull();
    });
  });

  // --- Milestone 5, Bloco M5F-2: troca da PROPRIA senha ---
  describe('changePassword', () => {
    it('sucesso: hash novo, mustChangePassword desligado, refresh tokens revogados, audita password_changed', async () => {
      const { service, users, refreshRepo, audit } = build();
      users.seed(buildUser({ mustChangePassword: true }));
      const login = await service.login('tenant-1', 'joao@empresa.com', 'senha123');
      expect(login.ok).toBe(true);

      const result = await service.changePassword('user-1', 'senha123', 'senha-nova-forte');

      expect(result).toEqual({ ok: true });
      const updated = await users.findById('user-1');
      expect(updated?.passwordHash).toBe('hashed:senha-nova-forte');
      expect(updated?.mustChangePassword).toBe(false);
      // Sessoes antigas morrem: todo refresh token do usuario revogado.
      expect(refreshRepo.all().every((t) => t.revokedAt !== undefined)).toBe(true);
      expect(
        audit.all().some((e) => e.action === 'auth.password_changed' && e.actorUserId === 'user-1'),
      ).toBe(true);
    });

    it('senha atual errada: invalid_current_password, NADA muda, audita failure', async () => {
      const { service, users, audit } = build();
      users.seed(buildUser());

      const result = await service.changePassword('user-1', 'senha-errada', 'senha-nova-forte');

      expect(result).toEqual({ ok: false, reason: 'invalid_current_password' });
      expect((await users.findById('user-1'))?.passwordHash).toBe('hashed:senha123');
      expect(audit.all().some((e) => e.action === 'auth.password_change.failure')).toBe(true);
    });

    it('senha nova curta (< 8): weak_password, hash intacto', async () => {
      const { service, users } = build();
      users.seed(buildUser());

      const result = await service.changePassword('user-1', 'senha123', 'curta');

      expect(result).toEqual({ ok: false, reason: 'weak_password' });
      expect((await users.findById('user-1'))?.passwordHash).toBe('hashed:senha123');
    });

    it('usuario inexistente ou suspenso: invalid_current_password (indistinguivel — anti-enumeracao)', async () => {
      const { service, users } = build();
      users.seed(buildUser({ status: 'suspended' }));

      expect(await service.changePassword('nao-existe', 'x', 'senha-nova-forte')).toEqual({
        ok: false,
        reason: 'invalid_current_password',
      });
      expect(await service.changePassword('user-1', 'senha123', 'senha-nova-forte')).toEqual({
        ok: false,
        reason: 'invalid_current_password',
      });
    });
  });

  // Fase Auth/Registro (2026-08-26) — login SEM tenantId, resolvido pelo
  // e-mail (unico global desde a migration `20260826210000`).
  describe('loginByEmail', () => {
    it('sucesso: resolve o tenant a partir do e-mail e loga normalmente', async () => {
      const { service, users } = build();
      users.seed(buildUser());

      const result = await service.loginByEmail('joao@empresa.com', 'senha123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.user.tenantId).toBe('tenant-1');
      }
    });

    it('e-mail inexistente -> ok:false (sem vazar existencia)', async () => {
      const { service } = build();
      expect(await service.loginByEmail('ninguem@empresa.com', 'qualquer')).toEqual({
        ok: false,
      });
    });

    it('senha errada -> ok:false', async () => {
      const { service, users } = build();
      users.seed(buildUser());
      expect(await service.loginByEmail('joao@empresa.com', 'senha-errada')).toEqual({
        ok: false,
      });
    });

    it('usuario suspenso -> ok:false', async () => {
      const { service, users } = build();
      users.seed(buildUser({ status: 'suspended' }));
      expect(await service.loginByEmail('joao@empresa.com', 'senha123')).toEqual({ ok: false });
    });
  });

  describe('lockout de conta (B1)', () => {
    /** 3 falhas / 60s — números pequenos para o teste ser legível. */
    function buildLockout(): AccountLockout {
      return new RateLimitStoreAccountLockout(new InMemoryRateLimitStore(), 3, 60_000);
    }

    it('bloqueia depois de N falhas e responde account_locked com o tempo restante', async () => {
      const lockout = buildLockout();
      const { service, users } = build(lockout);
      users.seed(buildUser());

      await service.login('tenant-1', 'joao@empresa.com', 'errada');
      await service.login('tenant-1', 'joao@empresa.com', 'errada');
      await service.login('tenant-1', 'joao@empresa.com', 'errada');

      const blocked = await service.login('tenant-1', 'joao@empresa.com', 'errada');
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) {
        expect(blocked.reason).toBe('account_locked');
        expect(blocked.retryAfterMs).toBeGreaterThan(0);
      }
    });

    it('conta bloqueada recusa até a senha CORRETA (o bloqueio vale mesmo para quem sabe a senha)', async () => {
      const lockout = buildLockout();
      const { service, users } = build(lockout);
      users.seed(buildUser());

      for (let i = 0; i < 3; i += 1) {
        await service.login('tenant-1', 'joao@empresa.com', 'errada');
      }

      const result = await service.login('tenant-1', 'joao@empresa.com', 'senha123');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('account_locked');
    });

    it('login bem-sucedido zera o histórico de falhas', async () => {
      const lockout = buildLockout();
      const { service, users } = build(lockout);
      users.seed(buildUser());

      await service.login('tenant-1', 'joao@empresa.com', 'errada');
      await service.login('tenant-1', 'joao@empresa.com', 'errada');
      expect((await service.login('tenant-1', 'joao@empresa.com', 'senha123')).ok).toBe(true);

      // Zerado: dá para errar 3 vezes de novo antes de bloquear.
      await service.login('tenant-1', 'joao@empresa.com', 'errada');
      await service.login('tenant-1', 'joao@empresa.com', 'errada');
      const stillOpen = await service.login('tenant-1', 'joao@empresa.com', 'errada');
      expect(stillOpen.ok).toBe(false);
      if (!stillOpen.ok) expect(stillOpen.reason).toBeUndefined();
    });

    it('bloqueio é registrado na trilha de auditoria', async () => {
      const lockout = buildLockout();
      const { service, users, audit } = build(lockout);
      users.seed(buildUser());

      for (let i = 0; i < 4; i += 1) {
        await service.login('tenant-1', 'joao@empresa.com', 'errada');
      }

      expect(audit.all().some((entry) => entry.action === 'auth.login.locked')).toBe(true);
    });

    it('ANTI-ENUMERAÇÃO: e-mail INEXISTENTE também é bloqueado (a resposta não prova existência)', async () => {
      const lockout = buildLockout();
      const { service } = build(lockout);
      // Nenhum usuário semeado — o e-mail não existe.

      for (let i = 0; i < 3; i += 1) {
        await service.loginByEmail('fantasma@empresa.com', 'qualquer');
      }

      const blocked = await service.loginByEmail('fantasma@empresa.com', 'qualquer');
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.reason).toBe('account_locked');
    });

    it('loginByEmail respeita o bloqueio antes de tocar o repositório', async () => {
      const lockout = buildLockout();
      const { service, users } = build(lockout);
      users.seed(buildUser());

      for (let i = 0; i < 3; i += 1) {
        await service.loginByEmail('joao@empresa.com', 'errada');
      }

      const result = await service.loginByEmail('joao@empresa.com', 'senha123');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('account_locked');
    });

    it('uma falha registra só UMA vez, mesmo passando por loginByEmail -> login', async () => {
      const lockout = buildLockout();
      const { service, users } = build(lockout);
      users.seed(buildUser());

      // Se cada tentativa contasse duas vezes, 2 tentativas já bloqueariam.
      await service.loginByEmail('joao@empresa.com', 'errada');
      await service.loginByEmail('joao@empresa.com', 'errada');

      expect((await lockout.status('joao@empresa.com')).locked).toBe(false);
    });

    it('sem lockout injetado, o comportamento é exatamente o de antes do bloco', async () => {
      const { service, users } = build();
      users.seed(buildUser());

      for (let i = 0; i < 10; i += 1) {
        await service.login('tenant-1', 'joao@empresa.com', 'errada');
      }

      // Nunca bloqueia, e a senha certa ainda entra.
      expect((await service.login('tenant-1', 'joao@empresa.com', 'senha123')).ok).toBe(true);
    });
  });
});

describe('AuthService — tenant suspenso (Painel /admin, Fase 4)', () => {
  function withTenant(status: 'active' | 'suspended') {
    const tenants = new FakeTenantRepository();
    tenants.seed({ id: 'tenant-1', name: 'Empresa', apiKeyHash: null, plan: 'pro', status });
    const ctx = build(undefined, tenants);
    ctx.users.seed(buildUser());
    return ctx;
  }

  it('login com a senha CERTA mas tenant suspenso → { ok: false, reason: "tenant_suspended" }', async () => {
    const { service } = withTenant('suspended');

    const result = await service.login('tenant-1', 'joao@empresa.com', 'senha123');

    expect(result).toEqual({ ok: false, reason: 'tenant_suspended' });
  });

  it('login com a senha ERRADA num tenant suspenso continua genérico (não vaza a suspensão)', async () => {
    const { service } = withTenant('suspended');

    const result = await service.login('tenant-1', 'joao@empresa.com', 'senha-errada');

    expect(result).toEqual({ ok: false });
  });

  it('tenant ativo loga normalmente', async () => {
    const { service } = withTenant('active');

    const result = await service.login('tenant-1', 'joao@empresa.com', 'senha123');

    expect(result.ok).toBe(true);
  });

  it('loginByEmail também recusa um tenant suspenso', async () => {
    const { service } = withTenant('suspended');

    const result = await service.loginByEmail('joao@empresa.com', 'senha123');

    expect(result).toEqual({ ok: false, reason: 'tenant_suspended' });
  });

  it('refresh após a suspensão derruba a sessão e revoga os refresh tokens', async () => {
    const { service, tenants, refreshRepo } = withTenant('active');
    const login = await service.login('tenant-1', 'joao@empresa.com', 'senha123');
    if (!login.ok) throw new Error('login deveria ter funcionado');

    await tenants!.setStatus('tenant-1', 'suspended');
    const refreshed = await service.refresh(login.refreshToken);

    expect(refreshed).toEqual({ ok: false });
    expect(refreshRepo.all().every((t) => t.revokedAt !== undefined)).toBe(true);
  });

  it('sem tenantRepository injetado, nada de suspensão é checado (comportamento pré-Fase 4)', async () => {
    const { service, users } = build();
    users.seed(buildUser());

    expect((await service.login('tenant-1', 'joao@empresa.com', 'senha123')).ok).toBe(true);
  });
});
