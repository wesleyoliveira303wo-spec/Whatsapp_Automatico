import { AuthService } from '../../../../src/services/auth/application/AuthService';
import { RefreshTokenService } from '../../../../src/services/auth/application/RefreshTokenService';
import { Sha256RefreshTokenCodec } from '../../../../src/services/auth/infrastructure/Sha256RefreshTokenCodec';
import { Hs256AccessTokenService } from '../../../../src/services/auth/infrastructure/Hs256AccessTokenService';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { User } from '../../../../src/services/auth/domain/entities/User';
import {
  FakeUserRepository,
  FakeRefreshTokenRepository,
  FakeAuditLogRepository,
  FakePasswordHasher,
} from '../testDoubles';

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

function build(): {
  service: AuthService;
  users: FakeUserRepository;
  refreshRepo: FakeRefreshTokenRepository;
  audit: FakeAuditLogRepository;
  access: Hs256AccessTokenService;
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
  );
  return { service, users, refreshRepo, audit, access };
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
});
