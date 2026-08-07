import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { createAuditLogRouter } from '../../../../src/services/auth/presentation/auditLogRouter';
import { AuditLogService } from '../../../../src/services/auth/application/AuditLogService';
import { Principal, RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';
import { FakeAuditLogRepository } from '../testDoubles';

/**
 * Testes do auditLogRouter (Fase 1, Bloco F1.5): thin router + requirePermission
 * ('audit:read') — mesma técnica de injeção de principal via middleware já
 * usada em `usersRouter.test.ts`. Diferente de `usersRouter`, esta rota
 * ACEITA o plano máquina (API key) — sem `requireHumanActor` — porque é só
 * leitura, sem necessidade de um ator identificável para auditar.
 */
interface AppUnderTest {
  app: express.Express;
  auditLogRepository: FakeAuditLogRepository;
}

function buildApp(principal?: Principal): AppUnderTest {
  const auditLogRepository = new FakeAuditLogRepository();
  const service = new AuditLogService(auditLogRepository);

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/audit-logs',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createAuditLogRouter(service),
  );
  return { app, auditLogRepository };
}

function person(role: UserRole, userId = randomUUID()): Principal {
  return { kind: 'user', userId, tenantId: 'tenant-1', role };
}

function machine(): Principal {
  return { kind: 'machine', tenantId: 'tenant-1' };
}

describe('auditLogRouter — RBAC (audit:read)', () => {
  it('sem principal algum — 401 not_authenticated (requirePermission barra antes do handler)', async () => {
    const { app } = buildApp(undefined);

    const response = await request(app).get('/api/tenants/tenant-1/audit-logs');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: 'not_authenticated' });
  });

  it('operator NAO le auditoria (sem audit:read) — 403 forbidden', async () => {
    const { app } = buildApp(person('operator'));

    const response = await request(app).get('/api/tenants/tenant-1/audit-logs');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'forbidden' });
  });

  it('manager LE auditoria (audit:read esta no catalogo desde o nivel manager) — 200', async () => {
    const { app, auditLogRepository } = buildApp(person('manager'));
    await auditLogRepository.record({ tenantId: 'tenant-1', action: 'auth.login.success' });

    const response = await request(app).get('/api/tenants/tenant-1/audit-logs');

    expect(response.status).toBe(200);
    expect(response.body.entries).toHaveLength(1);
  });

  it('administrator le auditoria — 200', async () => {
    const { app } = buildApp(person('administrator'));

    const response = await request(app).get('/api/tenants/tenant-1/audit-logs');

    expect(response.status).toBe(200);
  });

  it('owner le auditoria — 200', async () => {
    const { app } = buildApp(person('owner'));

    const response = await request(app).get('/api/tenants/tenant-1/audit-logs');

    expect(response.status).toBe(200);
  });

  it('plano MAQUINA (API key) tambem consegue ler — diferente de usersRouter, nao exige ator humano', async () => {
    const { app } = buildApp(machine());

    const response = await request(app).get('/api/tenants/tenant-1/audit-logs');

    expect(response.status).toBe(200);
  });
});

describe('auditLogRouter — listagem e filtros', () => {
  it('devolve as entradas mais recentes primeiro, respeitando o tenantId da URL', async () => {
    const { app, auditLogRepository } = buildApp(person('administrator'));
    await auditLogRepository.record({
      tenantId: 'tenant-1',
      action: 'auth.login.success',
      actorUserId: 'user-1',
    });
    await auditLogRepository.record({
      tenantId: 'tenant-2',
      action: 'auth.login.success',
      actorUserId: 'user-9',
    });

    const response = await request(app).get('/api/tenants/tenant-1/audit-logs');

    expect(response.body.entries).toHaveLength(1);
    expect(response.body.entries[0].actorUserId).toBe('user-1');
  });

  it('filtra por actorUserId via query string', async () => {
    const { app, auditLogRepository } = buildApp(person('administrator'));
    await auditLogRepository.record({
      tenantId: 'tenant-1',
      action: 'user.role_changed',
      actorUserId: 'user-9',
    });
    await auditLogRepository.record({
      tenantId: 'tenant-1',
      action: 'auth.login.success',
      actorUserId: 'user-1',
    });

    const response = await request(app)
      .get('/api/tenants/tenant-1/audit-logs')
      .query({ actorUserId: 'user-9' });

    expect(response.body.entries).toHaveLength(1);
    expect(response.body.entries[0].action).toBe('user.role_changed');
  });

  it('filtra por action via query string', async () => {
    const { app, auditLogRepository } = buildApp(person('administrator'));
    await auditLogRepository.record({ tenantId: 'tenant-1', action: 'user.role_changed' });
    await auditLogRepository.record({ tenantId: 'tenant-1', action: 'auth.login.success' });

    const response = await request(app)
      .get('/api/tenants/tenant-1/audit-logs')
      .query({ action: 'user.role_changed' });

    expect(response.body.entries).toHaveLength(1);
    expect(response.body.entries[0].action).toBe('user.role_changed');
  });

  it('respeita limit customizado e devolve nextCursor quando ha mais paginas', async () => {
    const { app, auditLogRepository } = buildApp(person('administrator'));
    await auditLogRepository.record({ tenantId: 'tenant-1', action: 'a1' });
    await auditLogRepository.record({ tenantId: 'tenant-1', action: 'a2' });
    await auditLogRepository.record({ tenantId: 'tenant-1', action: 'a3' });

    const response = await request(app).get('/api/tenants/tenant-1/audit-logs').query({ limit: 2 });

    expect(response.body.entries).toHaveLength(2);
    expect(response.body.nextCursor).toBeDefined();
  });

  it('limit invalido (> 100 ou nao numerico) — 400', async () => {
    const { app } = buildApp(person('administrator'));

    const response = await request(app)
      .get('/api/tenants/tenant-1/audit-logs')
      .query({ limit: 'abc' });

    expect(response.status).toBe(400);
  });
});
