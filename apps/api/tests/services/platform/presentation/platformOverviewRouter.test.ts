import express from 'express';
import request from 'supertest';

import { createPlatformOverviewRouter } from '../../../../src/services/platform/presentation/platformOverviewRouter';
import { createRequirePlatformUser } from '../../../../src/services/platform/presentation/requirePlatformUser';
import { PlatformAuthService } from '../../../../src/services/platform/application/PlatformAuthService';
import { Hs256PlatformSessionTokenService } from '../../../../src/services/platform/infrastructure/Hs256PlatformSessionTokenService';
import { PlatformOverviewService } from '../../../../src/services/platform/application/PlatformOverviewService';
import { PlatformHealthService } from '../../../../src/services/platform/application/PlatformHealthService';
import { TenantObservabilityService } from '../../../../src/services/platform/application/TenantObservabilityService';
import {
  FakeAccountLockout,
  FakePasswordHasher,
  FakePlatformAuditLogRepository,
  FakePlatformUserRepository,
  FakeTenantObservabilityRepository,
  emptyPlatformTotals,
  fakeLogger,
  tenantOverview,
} from '../testDoubles';
import type {
  PlatformHealthProbe,
  PlatformHealthSnapshot,
} from '../../../../src/services/platform/domain/providers/PlatformHealthProbe';

const SECRET = 'segredo-overview';
const NOW = new Date('2026-09-06T12:00:00Z');

const SNAPSHOT: PlatformHealthSnapshot = {
  database: 'ok',
  redis: 'ok',
  queues: [{ name: 'ai-reply', reachable: true, waiting: 0, active: 0, delayed: 0, failed: 0 }],
};

function buildApp(repo: FakeTenantObservabilityRepository, withProbe = true) {
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

  const tenants = new TenantObservabilityService(repo, () => NOW);
  const overview = new PlatformOverviewService(tenants, repo, () => NOW);
  const health = new PlatformHealthService(tenants, repo, () => NOW);
  if (withProbe) {
    const probe: PlatformHealthProbe = { snapshot: async () => SNAPSHOT };
    health.setHealthProbe(probe);
  }

  const app = express();
  app.use(express.json());
  app.use(
    '/api/platform',
    createPlatformOverviewRouter(
      overview,
      health,
      createRequirePlatformUser(tokenService, authService),
    ),
  );

  return { app, token: tokenService.issue({ platformUserId: admin.id }) };
}

describe('platformOverviewRouter — GET /overview', () => {
  it('sem crachá → 401', async () => {
    const { app } = buildApp(new FakeTenantObservabilityRepository([tenantOverview({ id: 't1' })]));

    const res = await request(app).get('/api/platform/overview');

    expect(res.status).toBe(401);
  });

  it('com crachá → 200 com actionQueue e kpis', async () => {
    const repo = new FakeTenantObservabilityRepository([
      tenantOverview({ id: 'down', sessionCount: 1, connectedSessionCount: 0 }),
    ]);
    repo.totals = emptyPlatformTotals({
      tenants: { total: 21, byPlan: { free: 20, pro: 0, enterprise: 1 } },
      campaigns: { running: 0, pausedByBreaker: 2 },
    });
    const { app, token } = buildApp(repo);

    const res = await request(app)
      .get('/api/platform/overview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.kpis.tenants.total).toBe(21);
    expect(res.body.kpis.tenantsNeedingAttention).toBe(1);
    expect(res.body.actionQueue.map((i: { key: string }) => i.key)).toEqual([
      'sessions_down',
      'campaigns_breaker',
    ]);
    // costUsd continua string (D46).
    expect(typeof res.body.kpis.ai30d.costUsd).toBe('string');
  });
});

describe('platformOverviewRouter — GET /health', () => {
  it('sem crachá → 401', async () => {
    const { app } = buildApp(new FakeTenantObservabilityRepository([]));

    expect((await request(app).get('/api/platform/health')).status).toBe(401);
  });

  it('com probe → 200 com infra, taxa de falha de IA e whatsapps caídos', async () => {
    const repo = new FakeTenantObservabilityRepository([
      tenantOverview({ id: 'down', sessionCount: 1, connectedSessionCount: 0 }),
    ]);
    repo.totals = emptyPlatformTotals({
      ai30d: { total: 100, success: 70, providerError: 30, validationRejected: 0, costUsd: '0' },
    });
    const { app, token } = buildApp(repo);

    const res = await request(app)
      .get('/api/platform/health')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.infra).toEqual(SNAPSHOT);
    expect(res.body.aiFailures30d).toEqual({ total: 100, providerError: 30, rate: 0.3 });
    expect(res.body.tenantsWithSessionsDown).toBe(1);
  });

  it('sem probe → infra: null', async () => {
    const { app, token } = buildApp(new FakeTenantObservabilityRepository([]), false);

    const res = await request(app)
      .get('/api/platform/health')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.infra).toBeNull();
  });
});
