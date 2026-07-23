import express, { Express } from 'express';
import request from 'supertest';
import { createAuthenticate } from '../../../../src/shared/presentation/authenticate';
import { Hs256AccessTokenService } from '../../../../src/services/auth/infrastructure/Hs256AccessTokenService';
import { createConversationsRouter } from '../../../../src/services/conversations/presentation/conversationsRouter';
import { createConversationsErrorHandler } from '../../../../src/services/conversations/presentation/conversationsErrorHandler';
import { ConversationsService } from '../../../../src/services/conversations/application/ConversationsService';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeApiKeyHasher } from '../../../shared/security/FakeApiKeyHasher';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeAuditLogRepository } from '../../auth/testDoubles';
import { FakeConversationRepository, FakeMessageRepository } from '../testDoubles';
import { Conversation } from '../../../../src/services/conversations/domain/entities/Conversation';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';

/**
 * Teste de integração (Milestone 3, Bloco 5 + Milestone 5, Bloco M5D):
 * exercita a cadeia real `authenticate` (porteiro dois-planos) ->
 * `requirePermission` (dentro do router) -> `conversationsRouter` ->
 * `ConversationsService` -> Fakes, exatamente como `index.ts` monta. Cobre:
 * IDOR (C1), plano MÁQUINA (chave da empresa = acesso total), e o RBAC do
 * plano PESSOA (crachá: cargo + ownership).
 */
const SECRET = 'segredo-de-teste-bem-comprido-1234567890';

function buildApp(): { app: Express; conversationRepository: FakeConversationRepository; access: Hs256AccessTokenService } {
  const hasher = new FakeApiKeyHasher();
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: hasher.hash('chave-tenant-1') });
  tenantRepository.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: hasher.hash('chave-tenant-2') });

  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();
  const conversationsService = new ConversationsService(
    conversationRepository,
    messageRepository,
    tenantRepository,
    new FakeAuditLogRepository(),
    new NoopLogger(),
  );
  const access = new Hs256AccessTokenService(SECRET, 900);
  const authenticate = createAuthenticate(access, hasher, tenantRepository, new NoopLogger());

  const app = express();
  app.use(express.json());
  app.use('/api/tenants/:tenantId/conversations', authenticate, createConversationsRouter(conversationsService));
  app.use('/api/tenants/:tenantId/conversations', createConversationsErrorHandler(new NoopLogger()));
  return { app, conversationRepository, access };
}

function buildConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-1',
    tenantId: 'tenant-1',
    sessionName: 'default',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'bot',
    createdAt: new Date('2026-07-10T12:00:00Z'),
    updatedAt: new Date('2026-07-10T12:00:00Z'),
    ...overrides,
  };
}

function bearer(access: Hs256AccessTokenService, userId: string, role: UserRole, tenantId = 'tenant-1'): string {
  return `Bearer ${access.issue({ userId, tenantId, role })}`;
}

describe('Integração authenticate + RBAC + conversationsRouter (M3 Bloco 5 / M5 Bloco M5D)', () => {
  it('sem credencial alguma, nenhuma rota é alcançada (401)', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/tenants/tenant-1/conversations');
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: 'missing_credentials' });
  });

  // --- Plano MÁQUINA (chave da empresa) — comportamento preservado ---

  it('[IDOR] chave do tenant-1 não escalona conversa do tenant-2 (403)', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation({ tenantId: 'tenant-2' }));

    const response = await request(app)
      .post('/api/tenants/tenant-2/conversations/conversation-1/escalate')
      .set('x-api-key', 'chave-tenant-1');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'tenant_mismatch' });
  });

  it('chave da empresa (plano máquina) escala normalmente (200)', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation({ status: 'bot' }));

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/escalate')
      .set('x-api-key', 'chave-tenant-1');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 'conversation-1', status: 'human' });
  });

  it('chave inválida -> 401', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/tenants/tenant-1/conversations').set('x-api-key', 'chave-nunca-vista');
    expect(response.status).toBe(401);
  });

  // --- Plano PESSOA (crachá) — RBAC + ownership ---

  it('Operator (crachá) escala e vira dono da conversa (200)', async () => {
    const { app, conversationRepository, access } = buildApp();
    conversationRepository.seed(buildConversation({ status: 'bot' }));

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/escalate')
      .set('authorization', bearer(access, 'op-1', 'operator'));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'human', assignedToUserId: 'op-1' });
  });

  it('ReadOnly NÃO pode escalar -> 403 forbidden (RBAC)', async () => {
    const { app, conversationRepository, access } = buildApp();
    conversationRepository.seed(buildConversation({ status: 'bot' }));

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/escalate')
      .set('authorization', bearer(access, 'ro-1', 'read_only'));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'forbidden' });
  });

  it('Operator retoma a PRÓPRIA conversa (200)', async () => {
    const { app, conversationRepository, access } = buildApp();
    conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-1' }));

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/resume')
      .set('authorization', bearer(access, 'op-1', 'operator'));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'bot' });
  });

  it('Operator NÃO retoma conversa de OUTRO operador -> 403 conversation_forbidden (ownership)', async () => {
    const { app, conversationRepository, access } = buildApp();
    conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-2' }));

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/resume')
      .set('authorization', bearer(access, 'op-1', 'operator'));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'conversation_forbidden' });
  });

  it('Manager retoma conversa de QUALQUER um (200)', async () => {
    const { app, conversationRepository, access } = buildApp();
    conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-2' }));

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/resume')
      .set('authorization', bearer(access, 'mgr-1', 'manager'));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'bot' });
  });

  it('[IDOR] crachá do tenant-1 não acessa tenant-2 (403)', async () => {
    const { app, access } = buildApp();
    const response = await request(app)
      .get('/api/tenants/tenant-2/conversations')
      .set('authorization', bearer(access, 'op-1', 'operator'));
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'tenant_mismatch' });
  });

  // --- Leitura/validação (via chave da empresa) ---

  it('escalonar conversa inexistente -> 404 conversation_not_found', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-inexistente/escalate')
      .set('x-api-key', 'chave-tenant-1');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: 'conversation_not_found' });
  });

  it('GET / lista as conversas do próprio tenant, paginado (200)', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation({ id: 'conversation-1' }));
    conversationRepository.seed(buildConversation({ id: 'conversation-2' }));

    const response = await request(app).get('/api/tenants/tenant-1/conversations').set('x-api-key', 'chave-tenant-1');

    expect(response.status).toBe(200);
    expect(response.body.conversations).toHaveLength(2);
  });

  it('query inválida (status fora do enum) -> 400 invalid_params', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .get('/api/tenants/tenant-1/conversations?status=nao-existe')
      .set('x-api-key', 'chave-tenant-1');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_params' });
  });

  it('GET /:id/messages devolve as mensagens em ordem cronológica (200)', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation());

    const response = await request(app)
      .get('/api/tenants/tenant-1/conversations/conversation-1/messages')
      .set('x-api-key', 'chave-tenant-1');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('messages');
  });
});
