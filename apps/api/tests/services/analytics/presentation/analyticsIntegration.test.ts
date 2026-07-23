import express, { Express } from 'express';
import request from 'supertest';
import { createRequireApiKey } from '../../../../src/shared/presentation/requireApiKey';
import { createAnalyticsRouter } from '../../../../src/services/analytics/presentation/analyticsRouter';
import { createAnalyticsErrorHandler } from '../../../../src/services/analytics/presentation/analyticsErrorHandler';
import { AnalyticsService } from '../../../../src/services/analytics/application/AnalyticsService';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeApiKeyHasher } from '../../../shared/security/FakeApiKeyHasher';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeAnalyticsRepository } from '../testDoubles';

/**
 * Teste de integracao (Milestone 4, Bloco M4C) — mesma disciplina de
 * `aiInteractionsIntegration.test.ts`: requireApiKey real + router real +
 * error handler real + Service real sobre `FakeAnalyticsRepository` (sem SQL).
 */
function buildApp(): { app: Express; analyticsRepository: FakeAnalyticsRepository } {
  const hasher = new FakeApiKeyHasher();
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: hasher.hash('chave-tenant-1') });
  tenantRepository.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: hasher.hash('chave-tenant-2') });

  const analyticsRepository = new FakeAnalyticsRepository();
  const analyticsService = new AnalyticsService(analyticsRepository, tenantRepository, new NoopLogger());
  const requireApiKey = createRequireApiKey(hasher, tenantRepository, new NoopLogger());

  const app = express();
  app.use(express.json());
  app.use('/api/tenants/:tenantId/analytics', requireApiKey, createAnalyticsRouter(analyticsService));
  app.use('/api/tenants/:tenantId/analytics', createAnalyticsErrorHandler(new NoopLogger()));
  return { app, analyticsRepository };
}

const OK_RANGE = 'from=2026-07-01&to=2026-07-10';

describe('Integracao requireApiKey + analyticsRouter (Milestone 4, Bloco M4C)', () => {
  it('sem X-API-Key, a rota nao e alcancada (401)', async () => {
    const { app } = buildApp();
    const response = await request(app).get(`/api/tenants/tenant-1/analytics/ai-usage?${OK_RANGE}`);
    expect(response.status).toBe(401);
  });

  it('[fecha o IDOR] chave do tenant-1 nao acessa analytics do tenant-2 (403)', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .get(`/api/tenants/tenant-2/analytics/ai-usage?${OK_RANGE}`)
      .set('x-api-key', 'chave-tenant-1');
    expect(response.status).toBe(403);
  });

  it('GET /ai-usage devolve os pontos do service (200), com costUsd string', async () => {
    const { app, analyticsRepository } = buildApp();
    analyticsRepository.seedAiUsage([
      {
        date: '2026-07-05',
        interactions: 3,
        successCount: 2,
        validationRejectedCount: 0,
        providerErrorCount: 1,
        tokensInput: 100,
        tokensOutput: 50,
        costUsd: '0.00123456',
        avgLatencyMs: 420,
      },
    ]);

    const response = await request(app).get(`/api/tenants/tenant-1/analytics/ai-usage?${OK_RANGE}`).set('x-api-key', 'chave-tenant-1');

    expect(response.status).toBe(200);
    expect(response.body.points).toHaveLength(1);
    expect(typeof response.body.points[0].costUsd).toBe('string');
  });

  it('GET /messages devolve os pontos (200)', async () => {
    const { app, analyticsRepository } = buildApp();
    analyticsRepository.seedMessageFlow([{ date: '2026-07-05', inbound: 10, outbound: 7 }]);
    const response = await request(app).get(`/api/tenants/tenant-1/analytics/messages?${OK_RANGE}`).set('x-api-key', 'chave-tenant-1');
    expect(response.status).toBe(200);
    expect(response.body.points).toEqual([{ date: '2026-07-05', inbound: 10, outbound: 7 }]);
  });

  it('GET /conversations devolve novas conversas + contagem por status (200)', async () => {
    const { app, analyticsRepository } = buildApp();
    analyticsRepository.seedNewConversations([{ date: '2026-07-05', count: 4 }]);
    analyticsRepository.seedConversationStatusCounts({ bot: 12, human: 3 });
    const response = await request(app).get(`/api/tenants/tenant-1/analytics/conversations?${OK_RANGE}`).set('x-api-key', 'chave-tenant-1');
    expect(response.status).toBe(200);
    expect(response.body.newConversations).toEqual([{ date: '2026-07-05', count: 4 }]);
    expect(response.body.statusCounts).toEqual({ bot: 12, human: 3 });
  });

  it('GET /session-stability devolve os pontos (200)', async () => {
    const { app, analyticsRepository } = buildApp();
    analyticsRepository.seedSessionStability([{ date: '2026-07-05', connected: 2, disconnected: 1, connecting: 0 }]);
    const response = await request(app).get(`/api/tenants/tenant-1/analytics/session-stability?${OK_RANGE}`).set('x-api-key', 'chave-tenant-1');
    expect(response.status).toBe(200);
    expect(response.body.points[0].connected).toBe(2);
  });

  it('faixa invalida (from > to) -> 400 invalid_analytics_range (via AnalyticsService + error handler)', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .get('/api/tenants/tenant-1/analytics/ai-usage?from=2026-07-10&to=2026-07-01')
      .set('x-api-key', 'chave-tenant-1');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_analytics_range');
  });

  it('from/to ausentes -> 400 invalid_params (Zod, antes do service)', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/tenants/tenant-1/analytics/ai-usage').set('x-api-key', 'chave-tenant-1');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_params');
  });

  it('granularity diferente de day -> 400 invalid_params (Zod, so day no MVP - D48)', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .get(`/api/tenants/tenant-1/analytics/ai-usage?${OK_RANGE}&granularity=hour`)
      .set('x-api-key', 'chave-tenant-1');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_params');
  });
});
