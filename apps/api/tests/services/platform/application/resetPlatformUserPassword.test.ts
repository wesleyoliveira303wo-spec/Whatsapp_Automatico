import { resetPlatformUserPassword } from '../../../../src/services/platform/application/resetPlatformUserPassword';
import { FakePlatformAuditLogRepository, FakePlatformUserRepository } from '../testDoubles';

const hasher = {
  hash: async (plain: string) => `hashed:${plain}`,
  verify: async () => true,
};

function setup(): {
  users: FakePlatformUserRepository;
  audit: FakePlatformAuditLogRepository;
  deps: { users: FakePlatformUserRepository; audit: FakePlatformAuditLogRepository; hasher: typeof hasher };
} {
  const users = new FakePlatformUserRepository();
  const audit = new FakePlatformAuditLogRepository();
  return { users, audit, deps: { users, audit, hasher } };
}

describe('resetPlatformUserPassword', () => {
  it('troca o hash e registra na trilha da plataforma', async () => {
    const { users, audit, deps } = setup();
    const admin = users.seed({ email: 'dono@francis.app' });

    const result = await resetPlatformUserPassword(deps, '  Dono@Francis.app ', 'senha-nova-bem-longa');

    expect(result).toEqual({ ok: true, platformUserId: admin.id });
    expect(admin.passwordHash).toBe('hashed:senha-nova-bem-longa');
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      platformUserId: admin.id,
      action: 'platform.password_reset',
    });
  });

  it('recusa senha curta sem tocar em nada', async () => {
    const { users, audit, deps } = setup();
    const admin = users.seed();

    const result = await resetPlatformUserPassword(deps, admin.email, 'curta');

    expect(result).toEqual({ ok: false, reason: 'too_short' });
    expect(admin.passwordHash).toBe('hash-da-senha');
    expect(audit.entries).toHaveLength(0);
  });

  it('e-mail inexistente não grava trilha', async () => {
    const { audit, deps } = setup();

    const result = await resetPlatformUserPassword(deps, 'ninguem@x.com', 'senha-nova-bem-longa');

    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(audit.entries).toHaveLength(0);
  });
});
