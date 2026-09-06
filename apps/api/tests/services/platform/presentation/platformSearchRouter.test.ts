import express from 'express';
import request from 'supertest';

import { createPlatformSearchRouter } from '../../../../src/services/platform/presentation/platformSearchRouter';
import { createRequirePlatformUser } from '../../../../src/services/platform/presentation/requirePlatformUser';
import { PlatformAuthService } from '../../../../src/services/platform/application/PlatformAuthService';
import { Hs256PlatformSessionTokenService } from '../../../../src/services/platform/infrastructure/Hs256PlatformSessionTokenService';
import { PlatformSearchService } from '../../../../src/services/platform/application/PlatformSearchService';
import {
  FakeAccountLockout,
  FakePasswordHasher,
  FakePlatformAuditLogRepository,
  FakePlatformSearchRepository,
  FakePlatformUserRepository,
  fakeLogger,
  rawHit,
} from '../testDoubles';

const SECRET = 'segredo-de-busca-1234567890';

function buildApp(repo: FakePlatformSearchRepository) {
  const users = new FakePlatformUserRepository();
  const admin = users.seed({ email: 'dono@francis.app', passwordHash: 'x' });
  const authService = new PlatformAuthService(
    users,
    new FakePasswordHasher(),
    new FakePlatformAuditLogRepository(),
    fakeLogger(),
    new FakeAccountLockout(),
  );
  const tokenService = new Hs256PlatformSessionTokenService(SECRET, 3600);
  const app = express();
  app.use(
    '/api/platform',
    createPlatformSearchRouter(
      new PlatformSearchService(repo),
      createRequirePlatformUser(tokenService, authService),
    ),
  );
  return { app, token: tokenService.issue({ platformUserId: admin.id }) };
}

describe('platformSearchRouter (Fase 6)', () => {
  it('sem crachá de plataforma → 401', async () => {
    const { app } = buildApp(new FakePlatformSearchRepository());
    const res = await request(app).get('/api/platform/search?q=abc');
    expect(res.status).toBe(401);
  });

  it('com crachá → 200 e resultados agrupados', async () => {
    const repo = new FakePlatformSearchRepository();
    repo.seed({ tenant: [rawHit({ kind: 'tenant', primary: 'Cliente Um', tenantId: 't1', tenantName: 'Cliente Um' })] });
    const { app, token } = buildApp(repo);

    const res = await request(app)
      .get('/api/platform/search?q=cliente')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.groups[0]).toMatchObject({ kind: 'tenant' });
    expect(repo.lastCall?.term).toBe('cliente');
  });

  it('q vazio → 200 com grupos vazios, sem tocar o repositório', async () => {
    const repo = new FakePlatformSearchRepository();
    const { app, token } = buildApp(repo);
    const res = await request(app)
      .get('/api/platform/search')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.groups).toEqual([]);
    expect(repo.lastCall).toBeNull();
  });
});
