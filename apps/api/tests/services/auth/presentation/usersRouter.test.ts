import express from 'express';
import request from 'supertest';

import { createUsersRouter } from '../../../../src/services/auth/presentation/usersRouter';
import { createUsersErrorHandler } from '../../../../src/services/auth/presentation/usersErrorHandler';
import { UserManagementService } from '../../../../src/services/auth/application/UserManagementService';
import { Principal, RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { User, UserRole } from '../../../../src/services/auth/domain/entities/User';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import {
  FakeAuditLogRepository,
  FakePasswordHasher,
  FakeRefreshTokenRepository,
  FakeUserRepository,
} from '../testDoubles';
import { randomUUID } from 'crypto';

/**
 * Testes do usersRouter (Milestone 5, Bloco M5E-3): thin router + human-only +
 * requirePermission + mapeamento de erros de Domain para HTTP (via
 * usersErrorHandler, montado path-scoped como em producao). O principal e
 * INJETADO por middleware (mesma tecnica do whatsAppSessionsRouter.test) — o
 * contrato do `authenticate` real ja e coberto em authenticate.test/
 * whatsAppSessionsIntegration.
 */
interface AppUnderTest {
  app: express.Express;
  users: FakeUserRepository;
}

function buildApp(principal?: Principal): AppUnderTest {
  const users = new FakeUserRepository();
  const service = new UserManagementService(
    users,
    new FakeRefreshTokenRepository(),
    new FakeAuditLogRepository(),
    new FakePasswordHasher(),
    new NoopLogger(),
  );

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/users',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createUsersRouter(service),
  );
  app.use('/api/tenants/:tenantId/users', createUsersErrorHandler(new NoopLogger()));
  return { app, users };
}

function person(role: UserRole, userId = randomUUID()): Principal {
  return { kind: 'user', userId, tenantId: 'tenant-1', role };
}

function seedUser(users: FakeUserRepository, overrides: Partial<User> = {}): User {
  const now = new Date();
  const user: User = {
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
  users.seed(user);
  return user;
}

describe('usersRouter — human-only (Milestone 5, Bloco M5E-3)', () => {
  it('plano MAQUINA (API key) e rejeitado com 403 human_required', async () => {
    const { app } = buildApp({ kind: 'machine', tenantId: 'tenant-1' });

    const response = await request(app).get('/api/tenants/tenant-1/users');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'human_required' });
  });

  it('sem principal algum tambem e 403 human_required (defesa em profundidade)', async () => {
    const { app } = buildApp(undefined);

    const response = await request(app).post('/api/tenants/tenant-1/users').send({});

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'human_required' });
  });
});

describe('usersRouter — RBAC por rota', () => {
  it('manager NAO lista usuarios (sem user:read) — 403 forbidden', async () => {
    const { app } = buildApp(person('manager'));

    const response = await request(app).get('/api/tenants/tenant-1/users');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'forbidden' });
  });

  it('administrator lista usuarios do tenant — 200', async () => {
    const { app, users } = buildApp(person('administrator'));
    seedUser(users);

    const response = await request(app).get('/api/tenants/tenant-1/users');

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0].passwordHash).toBeUndefined();
  });

  it('operator NAO cria usuario (sem user:create) — 403 forbidden', async () => {
    const { app } = buildApp(person('operator'));

    const response = await request(app)
      .post('/api/tenants/tenant-1/users')
      .send({ email: 'a@b.com', role: 'read_only', temporaryPassword: 'senha-provisoria' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'forbidden' });
  });
});

describe('usersRouter — criacao', () => {
  it('owner cria operator: 201, sem passwordHash, mustChangePassword true', async () => {
    const { app } = buildApp(person('owner'));

    const response = await request(app)
      .post('/api/tenants/tenant-1/users')
      .send({ email: 'maria@empresa.com', role: 'operator', temporaryPassword: 'senha-provisoria' });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ email: 'maria@empresa.com', role: 'operator', mustChangePassword: true });
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it('body invalido (email malformado) — 400 do Zod, sem chegar ao service', async () => {
    const { app } = buildApp(person('owner'));

    const response = await request(app)
      .post('/api/tenants/tenant-1/users')
      .send({ email: 'nao-e-email', role: 'operator', temporaryPassword: 'senha-provisoria' });

    expect(response.status).toBe(400);
  });

  it('administrator criando administrator — 403 role_not_allowed (hierarquia do service)', async () => {
    const { app } = buildApp(person('administrator'));

    const response = await request(app)
      .post('/api/tenants/tenant-1/users')
      .send({ email: 'x@y.com', role: 'administrator', temporaryPassword: 'senha-provisoria' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'role_not_allowed' });
  });

  it('email duplicado no tenant — 409 email_already_in_use', async () => {
    const { app, users } = buildApp(person('owner'));
    seedUser(users, { email: 'maria@empresa.com' });

    const response = await request(app)
      .post('/api/tenants/tenant-1/users')
      .send({ email: 'maria@empresa.com', role: 'operator', temporaryPassword: 'senha-provisoria' });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: 'email_already_in_use' });
  });
});

describe('usersRouter — ciclo de vida (cargo, suspensao, reset)', () => {
  it('PATCH /:userId/role promove operator a manager — 200', async () => {
    const { app, users } = buildApp(person('owner'));
    const target = seedUser(users, { role: 'operator' });

    const response = await request(app).patch(`/api/tenants/tenant-1/users/${target.id}/role`).send({ role: 'manager' });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('manager');
  });

  it('alterar o proprio cargo — 422 self_management_forbidden', async () => {
    const actorId = randomUUID();
    const { app, users } = buildApp(person('administrator', actorId));
    seedUser(users, { id: actorId, role: 'administrator' });

    const response = await request(app).patch(`/api/tenants/tenant-1/users/${actorId}/role`).send({ role: 'operator' });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: 'self_management_forbidden' });
  });

  it('POST /:userId/suspend e /:userId/reactivate — 200/200', async () => {
    const { app, users } = buildApp(person('administrator'));
    const target = seedUser(users, { role: 'operator' });

    const suspended = await request(app).post(`/api/tenants/tenant-1/users/${target.id}/suspend`);
    expect(suspended.status).toBe(200);
    expect(suspended.body.user.status).toBe('suspended');

    const reactivated = await request(app).post(`/api/tenants/tenant-1/users/${target.id}/reactivate`);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.user.status).toBe('active');
  });

  it('POST /:userId/reset-password — 200 com mustChangePassword true', async () => {
    const { app, users } = buildApp(person('administrator'));
    const target = seedUser(users, { role: 'operator' });

    const response = await request(app)
      .post(`/api/tenants/tenant-1/users/${target.id}/reset-password`)
      .send({ temporaryPassword: 'nova-provisoria' });

    expect(response.status).toBe(200);
    expect(response.body.user.mustChangePassword).toBe(true);
  });

  it('alvo inexistente — 404 user_not_found', async () => {
    const { app } = buildApp(person('owner'));

    const response = await request(app).post(`/api/tenants/tenant-1/users/${randomUUID()}/suspend`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: 'user_not_found' });
  });
});
