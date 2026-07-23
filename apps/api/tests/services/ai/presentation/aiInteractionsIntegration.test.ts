import express, { Express } from 'express';
import request from 'supertest';
import { createRequireApiKey } from '../../../../src/shared/presentation/requireApiKey';
import { createAiInteractionsRouter } from '../../../../src/services/ai/presentation/aiInteractionsRouter';
import { createAiInteractionsErrorHandler } from '../../../../src/services/ai/presentation/aiInteractionsErrorHandler';
import { AiInteractionsService } from '../../../../src/services/ai/application/AiInteractionsService';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeApiKeyHasher } from '../../../shared/security/FakeApiKeyHasher';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeAiInteractionRepository } from '../infrastructure/FakeAiInteractionRepository';
import { AiInteraction } from '../../../../src/services/ai/domain/entities/AiInteraction';

/**
 * Teste de integração (Milestone 3, Bloco 5) — mesma disciplina de
 * `whatsAppSessionsIntegration.test.ts`/`conversationsIntegration.test.ts`.
 */
function buildApp(): { app: Express; aiInteractionRepository: FakeAiInteractionRepository } {
  const hasher = new FakeApiKeyHasher();
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: hasher.hash('chave-tenant-1') });
  tenantRepository.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: hasher.hash('chave-tenant-2') });

  const aiInteractionRepository = new FakeAiInteractionRepository();
  const aiInteractionsService = new AiInteractionsService(aiInteractionRepository, tenantRepository, new NoopLogger());
  const requireApiKey = createRequireApiKey(hasher, tenantRepository, new NoopLogger());

  const app = express();
  app.use(express.json());
  app.use('/api/tenants/:tenantId/ai-interactions', requireApiKey, createAiInteractionsRouter(aiInteractionsService));
  app.use('/api/tenants/:tenantId/ai-interactions', createAiInteractionsErrorHandler(new NoopLogger()));
  return { app, aiInteractionRepository };
}

function buildInteraction(overrides: Partial<Omit<AiInteraction, 'id' | 'createdAt'>> = {}): Omit<AiInteraction, 'id' | 'createdAt'> {
  return {
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    provider: 'claude',
    model: 'claude-opus-4-8',
    promptVersion: 'v1',
    tokensInput: 12,
    tokensOutput: 8,
    costUsd: '0.00012000',
    latencyMs: 350,
    status: 'success',
    ...overrides,
  };
}

describe('Integração requireApiKey + aiInteractionsRouter (Milestone 3, Bloco 5)', () => {
  it('sem X-API-Key, a rota não é alcançada (401)', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/tenants/tenant-1/ai-interactions');

    expect(response.status).toBe(401);
  });

  it('[fecha o IDOR] API key válida do tenant-1 não lista ai-interactions do tenant-2 (403)', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/tenants/tenant-2/ai-interactions').set('x-api-key', 'chave-tenant-1');

    expect(response.status).toBe(403);
  });

  it('sem conversationId, lista todas as interações do tenant (200)', async () => {
    const { app, aiInteractionRepository } = buildApp();
    await aiInteractionRepository.record(buildInteraction({ conversationId: 'conversation-1' }));
    await aiInteractionRepository.record(buildInteraction({ conversationId: 'conversation-2' }));

    const response = await request(app).get('/api/tenants/tenant-1/ai-interactions').set('x-api-key', 'chave-tenant-1');

    expect(response.status).toBe(200);
    expect(response.body.interactions).toHaveLength(2);
  });

  it('com conversationId, filtra só as interações daquela conversa (200)', async () => {
    const { app, aiInteractionRepository } = buildApp();
    await aiInteractionRepository.record(buildInteraction({ conversationId: 'conversation-1' }));
    await aiInteractionRepository.record(buildInteraction({ conversationId: 'conversation-2' }));

    const response = await request(app)
      .get('/api/tenants/tenant-1/ai-interactions?conversationId=conversation-1')
      .set('x-api-key', 'chave-tenant-1');

    expect(response.status).toBe(200);
    expect(response.body.interactions).toHaveLength(1);
    expect(response.body.interactions[0].conversationId).toBe('conversation-1');
  });

  it('costUsd continua sendo string na resposta HTTP (nunca number — precisão decimal)', async () => {
    const { app, aiInteractionRepository } = buildApp();
    await aiInteractionRepository.record(buildInteraction({ costUsd: '0.00012345' }));

    const response = await request(app).get('/api/tenants/tenant-1/ai-interactions').set('x-api-key', 'chave-tenant-1');

    expect(typeof response.body.interactions[0].costUsd).toBe('string');
    expect(response.body.interactions[0].costUsd).toBe('0.00012345');
  });
});
