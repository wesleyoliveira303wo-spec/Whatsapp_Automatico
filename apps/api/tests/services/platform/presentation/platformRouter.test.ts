import express from 'express';
import request from 'supertest';

import { createPlatformRouter } from '../../../../src/services/platform/presentation/platformRouter';
import { createPlatformErrorHandler } from '../../../../src/services/platform/presentation/platformErrorHandler';
import { createRequirePlatformUser } from '../../../../src/services/platform/presentation/requirePlatformUser';
import { PlatformAuthService } from '../../../../src/services/platform/application/PlatformAuthService';
import { Hs256PlatformSessionTokenService } from '../../../../src/services/platform/infrastructure/Hs256PlatformSessionTokenService';
import { Hs256AccessTokenService } from '../../../../src/services/auth/infrastructure/Hs256AccessTokenService';
import {
  FakeAccountLockout,
  FakePasswordHasher,
  FakePlatformAuditLogRepository,
  FakePlatformUserRepository,
  fakeLogger,
} from '../testDoubles';

const SECRET = 'segredo-da-plataforma';

function buildApp() {
  const users = new FakePlatformUserRepository();
  const auditLog = new FakePlatformAuditLogRepository();
  const lockout = new FakeAccountLockout();
  const authService = new PlatformAuthService(
    users,
    new FakePasswordHasher(),
    auditLog,
    fakeLogger(),
    lockout,
  );
  const tokenService = new Hs256PlatformSessionTokenService(SECRET, 3600);

  const app = express();
  app.use(express.json());
  app.use(
    '/api/platform',
    createPlatformRouter(
      authService,
      tokenService,
      createRequirePlatformUser(tokenService, authService),
    ),
  );
  app.use('/api/platform', createPlatformErrorHandler(fakeLogger()));

  return { app, users, auditLog, lockout, tokenService };
}

describe('platformRouter — POST /auth/login', () => {
  it('credencial correta devolve crachá e o admin público', async () => {
    const { app, users, tokenService } = buildApp();
    users.seed({ email: 'dono@francis.app', passwordHash: 'hash:senha-forte' });

    const response = await request(app)
      .post('/api/platform/auth/login')
      .send({ email: 'dono@francis.app', password: 'senha-forte' });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: expect.any(String),
      email: 'dono@francis.app',
      name: 'Dono',
    });
    expect(tokenService.verify(response.body.token)).toEqual({
      platformUserId: response.body.user.id,
    });
  });

  it('nunca devolve o hash da senha no corpo', async () => {
    const { app, users } = buildApp();
    users.seed({ passwordHash: 'hash:senha-forte' });

    const response = await request(app)
      .post('/api/platform/auth/login')
      .send({ email: 'dono@francis.app', password: 'senha-forte' });

    expect(JSON.stringify(response.body)).not.toContain('hash:');
  });

  it('senha errada e e-mail inexistente devolvem o mesmo 401', async () => {
    const { app, users } = buildApp();
    users.seed({ passwordHash: 'hash:senha-forte' });

    const senhaErrada = await request(app)
      .post('/api/platform/auth/login')
      .send({ email: 'dono@francis.app', password: 'errada' });
    const inexistente = await request(app)
      .post('/api/platform/auth/login')
      .send({ email: 'ninguem@francis.app', password: 'errada' });

    expect(senhaErrada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(inexistente.body).toEqual(senhaErrada.body);
  });

  it('conta trancada devolve 423 com Retry-After', async () => {
    const { app, users, lockout } = buildApp();
    users.seed({ passwordHash: 'hash:senha-forte' });
    lockout.locked = true;
    lockout.retryAfterMs = 90_000;

    const response = await request(app)
      .post('/api/platform/auth/login')
      .send({ email: 'dono@francis.app', password: 'senha-forte' });

    expect(response.status).toBe(423);
    expect(response.headers['retry-after']).toBe('90');
    expect(response.body).toMatchObject({ error: 'account_locked', retryAfterSeconds: 90 });
  });

  it('corpo incompleto é 400, sem chegar ao serviço', async () => {
    const { app, auditLog } = buildApp();

    const response = await request(app).post('/api/platform/auth/login').send({ email: 'x' });

    expect(response.status).toBe(400);
    expect(auditLog.entries).toHaveLength(0);
  });
});

describe('platformRouter — porteiro de /auth/me e /auth/logout', () => {
  async function loggedIn() {
    const context = buildApp();
    const user = context.users.seed({ passwordHash: 'hash:senha-forte' });
    const login = await request(context.app)
      .post('/api/platform/auth/login')
      .send({ email: user.email, password: 'senha-forte' });
    return { ...context, user, token: login.body.token as string };
  }

  it('sem cabeçalho Authorization — 401', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/platform/auth/me');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: 'missing_platform_session' });
  });

  it('com crachá válido — devolve o admin', async () => {
    const { app, token, user } = await loggedIn();

    const response = await request(app)
      .get('/api/platform/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ id: user.id, email: user.email });
  });

  it('crachá de TENANT não abre a porta da plataforma', async () => {
    const { app } = await loggedIn();
    const crachaDeTenant = new Hs256AccessTokenService(SECRET, 3600).issue({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'owner',
    });

    const response = await request(app)
      .get('/api/platform/auth/me')
      .set('Authorization', `Bearer ${crachaDeTenant}`);

    expect(response.status).toBe(401);
  });

  it('admin suspenso DEPOIS do login perde o acesso na requisição seguinte', async () => {
    const { app, token, users, user } = await loggedIn();

    // O crachá continua criptograficamente válido — quem corta é a releitura
    // do banco feita pelo porteiro a cada requisição.
    users.users.find((u) => u.id === user.id)!.status = 'suspended';

    const response = await request(app)
      .get('/api/platform/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: 'invalid_platform_session' });
  });

  it('logout responde 204 e registra a saída na trilha', async () => {
    const { app, token, auditLog, user } = await loggedIn();

    const response = await request(app)
      .post('/api/platform/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(204);
    expect(auditLog.entries.at(-1)).toMatchObject({
      action: 'platform.logout',
      platformUserId: user.id,
    });
  });

  it('logout sem sessão válida — 401', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/platform/auth/logout')
      .set('Authorization', 'Bearer token-forjado');

    expect(response.status).toBe(401);
  });
});
