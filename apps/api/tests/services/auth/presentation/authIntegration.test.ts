import express, { Express } from 'express';
import request from 'supertest';
import { createAuthRouter } from '../../../../src/services/auth/presentation/authRouter';
import { createAuthErrorHandler } from '../../../../src/services/auth/presentation/authErrorHandler';
import { AuthService } from '../../../../src/services/auth/application/AuthService';
import { RefreshTokenService } from '../../../../src/services/auth/application/RefreshTokenService';
import { Sha256RefreshTokenCodec } from '../../../../src/services/auth/infrastructure/Sha256RefreshTokenCodec';
import { Hs256AccessTokenService } from '../../../../src/services/auth/infrastructure/Hs256AccessTokenService';
import { createRequireUser } from '../../../../src/shared/presentation/requireUser';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { User } from '../../../../src/services/auth/domain/entities/User';
import {
  FakeUserRepository,
  FakeRefreshTokenRepository,
  FakeAuditLogRepository,
  FakePasswordHasher,
} from '../testDoubles';

const SECRET = 'segredo-de-teste-bem-comprido-1234567890';

function buildApp(): { app: Express; users: FakeUserRepository } {
  const users = new FakeUserRepository();
  const now = new Date('2026-07-18T12:00:00Z');
  const seeded: User = {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'joao@empresa.com',
    passwordHash: 'hashed:senha123',
    role: 'operator',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  users.seed(seeded);

  const access = new Hs256AccessTokenService(SECRET, 900);
  const refresh = new RefreshTokenService(
    new FakeRefreshTokenRepository(),
    new Sha256RefreshTokenCodec(),
    7 * 24 * 60 * 60 * 1000,
  );
  const authService = new AuthService(
    users,
    new FakePasswordHasher(),
    access,
    refresh,
    new FakeAuditLogRepository(),
    new NoopLogger(),
  );
  const requireUser = createRequireUser(access);

  const app = express();
  app.use(express.json());
  app.use('/api/tenants/:tenantId/auth', createAuthRouter(authService, requireUser));
  app.use('/api/tenants/:tenantId/auth', createAuthErrorHandler(new NoopLogger()));
  return { app, users };
}

describe('Integracao authRouter (Milestone 5, Bloco M5C)', () => {
  it('POST /login com credenciais corretas: 200 + tokens + user sem passwordHash', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/tenants/tenant-1/auth/login')
      .send({ email: 'joao@empresa.com', password: 'senha123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.email).toBe('joao@empresa.com');
  });

  it('POST /login com senha errada: 401 invalid_credentials', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/tenants/tenant-1/auth/login')
      .send({ email: 'joao@empresa.com', password: 'errada' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_credentials');
  });

  it('POST /login sem body valido: 400', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/api/tenants/tenant-1/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('POST /refresh renova os tokens (200)', async () => {
    const { app } = buildApp();
    const login = await request(app)
      .post('/api/tenants/tenant-1/auth/login')
      .send({ email: 'joao@empresa.com', password: 'senha123' });
    const res = await request(app)
      .post('/api/tenants/tenant-1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('GET /me sem cracha: 401', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/tenants/tenant-1/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /me com cracha valido: 200 + usuario', async () => {
    const { app } = buildApp();
    const login = await request(app)
      .post('/api/tenants/tenant-1/auth/login')
      .send({ email: 'joao@empresa.com', password: 'senha123' });
    const res = await request(app)
      .get('/api/tenants/tenant-1/auth/me')
      .set('authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe('user-1');
  });

  it('POST /logout com cracha valido: 204', async () => {
    const { app } = buildApp();
    const login = await request(app)
      .post('/api/tenants/tenant-1/auth/login')
      .send({ email: 'joao@empresa.com', password: 'senha123' });
    const res = await request(app)
      .post('/api/tenants/tenant-1/auth/logout')
      .set('authorization', `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: login.body.refreshToken });
    expect(res.status).toBe(204);
  });
});
