import express from 'express';
import request from 'supertest';

import { createPlatformTenantsRouter } from '../../../../src/services/platform/presentation/platformTenantsRouter';
import { createRequirePlatformUser } from '../../../../src/services/platform/presentation/requirePlatformUser';
import { PlatformAuthService } from '../../../../src/services/platform/application/PlatformAuthService';
import { Hs256PlatformSessionTokenService } from '../../../../src/services/platform/infrastructure/Hs256PlatformSessionTokenService';
import { TenantObservabilityService } from '../../../../src/services/platform/application/TenantObservabilityService';
import { TenantControlService } from '../../../../src/services/platform/application/TenantControlService';
import { createPlatformErrorHandler } from '../../../../src/services/platform/presentation/platformErrorHandler';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { TenantOverview } from '../../../../src/services/platform/domain/entities/TenantOverview';
import { TenantDetail } from '../../../../src/services/platform/domain/entities/TenantDetail';
import {
  ObservabilityRange,
  TenantObservabilityRepository,
} from '../../../../src/services/platform/domain/repositories/TenantObservabilityRepository';
import {
  FakeAccountLockout,
  FakePasswordHasher,
  FakePlatformAuditLogRepository,
  FakePlatformUserRepository,
  fakeLogger,
} from '../testDoubles';

const SECRET = 'segredo-da-plataforma-tenants';
const NOW = new Date('2026-09-06T12:00:00Z');

function tenant(patch: Partial<TenantOverview>): TenantOverview {
  return {
    id: 't1',
    name: 'Cliente Um',
    plan: 'enterprise',
    status: 'active',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    sessionCount: 2,
    connectedSessionCount: 1,
    userCount: 2,
    lastActivityAt: new Date('2026-09-05T22:00:00Z'),
    messages30d: { inbound: 485, outbound: 1047 },
    ai30d: { total: 213, success: 156, providerError: 53, validationRejected: 4, costUsd: '0.00000000' },
    conversations30d: { total: 105, escalated: 3 },
    aiProfileConfigured: true,
    ...patch,
  };
}

class StubRepo implements TenantObservabilityRepository {
  constructor(
    private readonly overviews: TenantOverview[],
    private readonly detail: TenantDetail | null,
  ) {}
  async listTenantOverviews(_range: ObservabilityRange): Promise<TenantOverview[]> {
    return this.overviews;
  }
  async getTenantDetail(id: string): Promise<TenantDetail | null> {
    return this.detail && this.detail.id === id ? this.detail : null;
  }
}

function buildApp(repo: TenantObservabilityRepository) {
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
  const observability = new TenantObservabilityService(repo, () => NOW);

  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 't1', name: 'Cliente Um', apiKeyHash: null, plan: 'free', status: 'active' });
  const controlAudit = new FakePlatformAuditLogRepository();
  const controlService = new TenantControlService(tenants, controlAudit, fakeLogger());

  const app = express();
  app.use(express.json());
  app.use(
    '/api/platform',
    createPlatformTenantsRouter(
      observability,
      createRequirePlatformUser(tokenService, authService),
      controlService,
    ),
  );
  app.use(createPlatformErrorHandler(fakeLogger()));

  const token = tokenService.issue({ platformUserId: admin.id });
  return { app, token, tenants, controlAudit };
}

const DETAIL: TenantDetail = {
  ...tenant({ id: 't1' }),
  sessions: [
    {
      sessionName: 'Lest Conceito',
      status: 'connected',
      phoneNumber: '5521999998888',
      lastSeen: new Date('2026-09-05T23:07:07Z'),
      aiProfileConfigured: true,
    },
  ],
  campaigns: { total: 3, running: 1, paused: 1, pausedByBreaker: 1 },
  contactCount: 38,
  recentSessionEvents: [
    {
      sessionName: 'Lest Conceito',
      status: 'connected',
      disconnectReason: null,
      occurredAt: new Date('2026-09-05T23:07:07Z'),
    },
  ],
};

describe('platformTenantsRouter — GET /tenants', () => {
  it('sem crachá de plataforma → 401', async () => {
    const { app } = buildApp(new StubRepo([tenant({ id: 't1' })], null));

    const res = await request(app).get('/api/platform/tenants');

    expect(res.status).toBe(401);
  });

  it('com crachá → 200, tenants com sinais e datas em ISO string', async () => {
    const { app, token } = buildApp(
      new StubRepo(
        [
          tenant({ id: 't1' }),
          tenant({ id: 't2', name: 'Nunca começou', sessionCount: 0, lastActivityAt: null, messages30d: { inbound: 0, outbound: 0 } }),
        ],
        null,
      ),
    );

    const res = await request(app)
      .get('/api/platform/tenants')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.tenants).toHaveLength(2);
    const first = res.body.tenants[0];
    expect(typeof first.createdAt).toBe('string');
    expect(first.createdAt).toBe('2026-07-01T00:00:00.000Z');
    // costUsd continua STRING (D46 — nunca number).
    expect(typeof first.ai30d.costUsd).toBe('string');
    // sinais achatados, cada um com rótulo.
    expect(Array.isArray(first.signals)).toBe(true);
    expect(first.signals[0].label.length).toBeGreaterThan(0);
  });

  it('crachá de TENANT não abre o Centro de Tenants', async () => {
    // Um token assinado com outro segredo/formato nunca passa no porteiro.
    const { app } = buildApp(new StubRepo([tenant({ id: 't1' })], null));

    const res = await request(app)
      .get('/api/platform/tenants')
      .set('Authorization', 'Bearer nao-e-um-cracha-de-plataforma');

    expect(res.status).toBe(401);
  });
});

describe('platformTenantsRouter — GET /tenants/:tenantId', () => {
  it('tenant inexistente → 404 tenant_not_found', async () => {
    const { app, token } = buildApp(new StubRepo([], DETAIL));

    const res = await request(app)
      .get('/api/platform/tenants/ghost')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'tenant_not_found' });
  });

  it('tenant existente → 200 com sessões, campanhas, contatos e eventos', async () => {
    const { app, token } = buildApp(new StubRepo([], DETAIL));

    const res = await request(app)
      .get('/api/platform/tenants/t1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.tenant).toMatchObject({
      id: 't1',
      contactCount: 38,
      campaigns: { total: 3, running: 1, paused: 1, pausedByBreaker: 1 },
    });
    expect(res.body.tenant.sessions[0]).toMatchObject({ sessionName: 'Lest Conceito', status: 'connected' });
    expect(res.body.tenant.recentSessionEvents[0].occurredAt).toBe('2026-09-05T23:07:07.000Z');
  });
});

describe('platformTenantsRouter — Fase 4: controle (escritas auditadas)', () => {
  it('PATCH /tenants/:id/plan sem crachá → 401, sem tocar no tenant', async () => {
    const { app, tenants } = buildApp(new StubRepo([], null));

    const res = await request(app).patch('/api/platform/tenants/t1/plan').send({ plan: 'pro' });

    expect(res.status).toBe(401);
    expect((await tenants.findById('t1'))?.plan).toBe('free');
  });

  it('PATCH /tenants/:id/plan com crachá → 200, plano trocado e auditado', async () => {
    const { app, token, tenants, controlAudit } = buildApp(new StubRepo([], null));

    const res = await request(app)
      .patch('/api/platform/tenants/t1/plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ plan: 'pro' });

    expect(res.status).toBe(200);
    expect(res.body.tenant).toMatchObject({ id: 't1', plan: 'pro', status: 'active' });
    expect((await tenants.findById('t1'))?.plan).toBe('pro');
    expect(controlAudit.actions()).toEqual(['tenant.plan_changed']);
  });

  it('PATCH /tenants/:id/plan com plano inválido → 400', async () => {
    const { app, token } = buildApp(new StubRepo([], null));

    const res = await request(app)
      .patch('/api/platform/tenants/t1/plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ plan: 'ouro' });

    expect(res.status).toBe(400);
  });

  it('POST /tenants/:id/suspend → 200, status suspenso e auditado antes', async () => {
    const { app, token, tenants, controlAudit } = buildApp(new StubRepo([], null));

    const res = await request(app)
      .post('/api/platform/tenants/t1/suspend')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.tenant.status).toBe('suspended');
    expect((await tenants.findById('t1'))?.status).toBe('suspended');
    expect(controlAudit.entries[0]).toMatchObject({
      action: 'tenant.suspended',
      tenantId: 't1',
      metadata: { from: 'active', to: 'suspended' },
    });
  });

  it('POST /tenants/:id/suspend num tenant já suspenso → 409 no_op', async () => {
    const { app, token } = buildApp(new StubRepo([], null));

    await request(app)
      .post('/api/platform/tenants/t1/suspend')
      .set('Authorization', `Bearer ${token}`);
    const res = await request(app)
      .post('/api/platform/tenants/t1/suspend')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'no_op' });
  });

  it('POST /tenants/:id/reactivate → 200, status ativo', async () => {
    const { app, token, tenants } = buildApp(new StubRepo([], null));

    await request(app)
      .post('/api/platform/tenants/t1/suspend')
      .set('Authorization', `Bearer ${token}`);
    const res = await request(app)
      .post('/api/platform/tenants/t1/reactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.tenant.status).toBe('active');
    expect((await tenants.findById('t1'))?.status).toBe('active');
  });

  it('POST /tenants/:id/suspend num tenant inexistente → 404', async () => {
    const { app, token } = buildApp(new StubRepo([], null));

    const res = await request(app)
      .post('/api/platform/tenants/ghost/suspend')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'tenant_not_found' });
  });
});
