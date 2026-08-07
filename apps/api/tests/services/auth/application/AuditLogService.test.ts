import {
  AuditLogService,
  DEFAULT_AUDIT_LOG_LIST_LIMIT,
  MAX_AUDIT_LOG_LIST_LIMIT,
} from '../../../../src/services/auth/application/AuditLogService';
import { FakeAuditLogRepository } from '../testDoubles';

/**
 * Testes de `AuditLogService` (Fase 1, Bloco F1.5) — thin service: a única
 * regra própria é resolver o `limit` (default + teto) fora do Zod, mesmo
 * racional documentado em `usersRouter.ts`/`DEFAULT_LIST_LIMIT`.
 */
describe('AuditLogService', () => {
  it('aplica o limit default quando nao informado', async () => {
    const repo = new FakeAuditLogRepository();
    for (let i = 0; i < 25; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await repo.record({ tenantId: 'tenant-1', action: 'auth.login.success' });
    }
    const service = new AuditLogService(repo);

    const page = await service.listAuditLogs('tenant-1', {});

    expect(page.entries).toHaveLength(DEFAULT_AUDIT_LOG_LIST_LIMIT);
  });

  it('respeita um limit explicito dentro do teto', async () => {
    const repo = new FakeAuditLogRepository();
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await repo.record({ tenantId: 'tenant-1', action: 'auth.login.success' });
    }
    const service = new AuditLogService(repo);

    const page = await service.listAuditLogs('tenant-1', { limit: 5 });

    expect(page.entries).toHaveLength(5);
  });

  it('corta um limit acima do teto para MAX_AUDIT_LOG_LIST_LIMIT (defesa em profundidade, mesmo se o Zod ja bloquear)', async () => {
    const repo = new FakeAuditLogRepository();
    for (let i = 0; i < MAX_AUDIT_LOG_LIST_LIMIT + 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await repo.record({ tenantId: 'tenant-1', action: 'auth.login.success' });
    }
    const service = new AuditLogService(repo);

    const page = await service.listAuditLogs('tenant-1', { limit: 999 });

    expect(page.entries).toHaveLength(MAX_AUDIT_LOG_LIST_LIMIT);
  });

  it('repassa filtros de ator/acao e cursor ao repositorio', async () => {
    const repo = new FakeAuditLogRepository();
    await repo.record({ tenantId: 'tenant-1', actorUserId: 'user-9', action: 'user.role_changed' });
    await repo.record({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      action: 'auth.login.success',
    });
    const service = new AuditLogService(repo);

    const page = await service.listAuditLogs('tenant-1', { actorUserId: 'user-9' });

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].action).toBe('user.role_changed');
  });

  it('nunca cruza tenant (isolamento)', async () => {
    const repo = new FakeAuditLogRepository();
    await repo.record({ tenantId: 'tenant-1', action: 'auth.login.success' });
    await repo.record({ tenantId: 'tenant-2', action: 'auth.login.success' });
    const service = new AuditLogService(repo);

    const page = await service.listAuditLogs('tenant-1', {});

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].tenantId).toBe('tenant-1');
  });
});
