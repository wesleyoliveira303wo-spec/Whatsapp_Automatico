import { PlatformAuthService } from '../../../../src/services/platform/application/PlatformAuthService';
import { InvalidPlatformCredentialsError } from '../../../../src/services/platform/domain/errors/InvalidPlatformCredentialsError';
import { PlatformAccountLockedError } from '../../../../src/services/platform/domain/errors/PlatformAccountLockedError';
import {
  FakeAccountLockout,
  FakePasswordHasher,
  FakePlatformAuditLogRepository,
  FakePlatformUserRepository,
  fakeLogger,
} from '../testDoubles';

function buildSut() {
  const users = new FakePlatformUserRepository();
  const auditLog = new FakePlatformAuditLogRepository();
  const lockout = new FakeAccountLockout();
  const service = new PlatformAuthService(
    users,
    new FakePasswordHasher(),
    auditLog,
    fakeLogger(),
    lockout,
  );
  return { service, users, auditLog, lockout };
}

describe('PlatformAuthService.login', () => {
  it('devolve o admin sem o hash da senha quando a credencial confere', async () => {
    const { service, users } = buildSut();
    users.seed({ email: 'dono@francis.app', passwordHash: 'hash:senha-forte' });

    const user = await service.login('dono@francis.app', 'senha-forte');

    expect(user).toEqual({ id: expect.any(String), email: 'dono@francis.app', name: 'Dono' });
    // A garantia central de `PublicPlatformUser`: o hash nunca cruza a fronteira.
    expect(Object.keys(user)).not.toContain('passwordHash');
  });

  it('normaliza o e-mail antes de procurar (espaços e maiúsculas)', async () => {
    const { service, users } = buildSut();
    users.seed({ email: 'dono@francis.app', passwordHash: 'hash:senha-forte' });

    await expect(service.login('  DONO@Francis.App ', 'senha-forte')).resolves.toMatchObject({
      email: 'dono@francis.app',
    });
  });

  it('registra o último acesso e zera a trava quando o login dá certo', async () => {
    const { service, users, lockout } = buildSut();
    const seeded = users.seed({ passwordHash: 'hash:senha-forte' });

    await service.login(seeded.email, 'senha-forte');

    expect(users.touchCalls).toHaveLength(1);
    expect(lockout.cleared).toEqual([seeded.email]);
  });

  it('senha errada e e-mail inexistente devolvem o MESMO erro (anti-enumeração)', async () => {
    const { service, users } = buildSut();
    users.seed({ email: 'dono@francis.app', passwordHash: 'hash:senha-forte' });

    const senhaErrada = await service.login('dono@francis.app', 'errada').catch((e) => e);
    const inexistente = await service.login('ninguem@francis.app', 'errada').catch((e) => e);

    expect(senhaErrada).toBeInstanceOf(InvalidPlatformCredentialsError);
    expect(inexistente).toBeInstanceOf(InvalidPlatformCredentialsError);
    expect(inexistente.message).toBe(senhaErrada.message);
  });

  it('e-mail inexistente TAMBÉM gasta uma tentativa da trava', async () => {
    const { service, lockout } = buildSut();

    await expect(service.login('ninguem@francis.app', 'x')).rejects.toBeInstanceOf(
      InvalidPlatformCredentialsError,
    );

    // Sem isto, a própria trava viraria o oráculo de "este e-mail existe".
    expect(lockout.failures).toEqual(['ninguem@francis.app']);
  });

  it('conta suspensa não entra, mesmo com a senha certa', async () => {
    const { service, users } = buildSut();
    users.seed({ passwordHash: 'hash:senha-forte', status: 'suspended' });

    await expect(service.login('dono@francis.app', 'senha-forte')).rejects.toBeInstanceOf(
      InvalidPlatformCredentialsError,
    );
  });

  it('conta trancada devolve o tempo restante, sem sequer conferir a senha', async () => {
    const { service, users, lockout } = buildSut();
    users.seed({ passwordHash: 'hash:senha-forte' });
    lockout.locked = true;
    lockout.retryAfterMs = 90_000;

    const error = await service.login('dono@francis.app', 'senha-forte').catch((e) => e);

    expect(error).toBeInstanceOf(PlatformAccountLockedError);
    expect(error.retryAfterMs).toBe(90_000);
  });

  it('o login sobrevive a uma falha ao gravar o último acesso (dado auxiliar)', async () => {
    const { service, users } = buildSut();
    users.seed({ passwordHash: 'hash:senha-forte' });
    users.failTouch = true;

    await expect(service.login('dono@francis.app', 'senha-forte')).resolves.toMatchObject({
      email: 'dono@francis.app',
    });
  });

  it('o login sobrevive a uma falha da trilha — auditoria nunca derruba a ação', async () => {
    const { service, users, auditLog } = buildSut();
    users.seed({ passwordHash: 'hash:senha-forte' });
    auditLog.failAppend = true;

    await expect(service.login('dono@francis.app', 'senha-forte')).resolves.toBeDefined();
  });
});

describe('PlatformAuthService — trilha', () => {
  it('audita o sucesso com o id do admin', async () => {
    const { service, users, auditLog } = buildSut();
    const seeded = users.seed({ passwordHash: 'hash:senha-forte' });

    await service.login(seeded.email, 'senha-forte');

    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]).toMatchObject({
      action: 'platform.login',
      platformUserId: seeded.id,
    });
  });

  it('audita a FALHA, guardando o e-mail tentado e o motivo', async () => {
    const { service, auditLog } = buildSut();

    await service.login('ninguem@francis.app', 'x').catch(() => undefined);

    expect(auditLog.entries[0]).toMatchObject({
      action: 'platform.login_failed',
      metadata: { attemptedEmail: 'ninguem@francis.app', reason: 'unknown_email' },
    });
  });

  it('guarda IP e user agent da tentativa', async () => {
    const { service, users, auditLog } = buildSut();
    users.seed({ passwordHash: 'hash:senha-forte' });

    await service.login('dono@francis.app', 'senha-forte', {
      ip: '203.0.113.7',
      userAgent: 'Firefox',
    });

    expect(auditLog.entries[0]).toMatchObject({ ip: '203.0.113.7', userAgent: 'Firefox' });
  });

  it('logout vira uma entrada e nunca lança, mesmo com a trilha fora do ar', async () => {
    const { service, auditLog } = buildSut();

    await service.logout('admin-1');
    expect(auditLog.actions()).toEqual(['platform.logout']);

    auditLog.failAppend = true;
    await expect(service.logout('admin-1')).resolves.toBeUndefined();
  });
});

describe('PlatformAuthService.describe', () => {
  it('devolve o admin ativo', async () => {
    const { service, users } = buildSut();
    const seeded = users.seed();

    await expect(service.describe(seeded.id)).resolves.toMatchObject({ id: seeded.id });
  });

  it('devolve null para admin inexistente ou suspenso — é o que corta o acesso na hora', async () => {
    const { service, users } = buildSut();
    const suspenso = users.seed({ status: 'suspended' });

    await expect(service.describe(suspenso.id)).resolves.toBeNull();
    await expect(service.describe('nao-existe')).resolves.toBeNull();
  });
});
