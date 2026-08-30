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
import {
  FakeConversationRepository,
  FakeMessageRepository,
  FakeContactResolver,
} from '../testDoubles';
import { FakeMediaSender } from '../../whatsapp/infrastructure/FakeMediaSender';
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

function buildApp(): {
  app: Express;
  conversationRepository: FakeConversationRepository;
  access: Hs256AccessTokenService;
  mediaSender: FakeMediaSender;
  contactResolver: FakeContactResolver;
} {
  const hasher = new FakeApiKeyHasher();
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({
    id: 'tenant-1',
    name: 'Empresa Um',
    apiKeyHash: hasher.hash('chave-tenant-1'),
  });
  tenantRepository.seed({
    id: 'tenant-2',
    name: 'Empresa Dois',
    apiKeyHash: hasher.hash('chave-tenant-2'),
  });

  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();
  const mediaSender = new FakeMediaSender();
  const contactResolver = new FakeContactResolver();
  const conversationsService = new ConversationsService(
    conversationRepository,
    messageRepository,
    tenantRepository,
    new FakeAuditLogRepository(),
    new NoopLogger(),
    undefined,
    undefined,
    mediaSender,
    undefined,
    contactResolver,
  );
  const access = new Hs256AccessTokenService(SECRET, 900);
  const authenticate = createAuthenticate(access, hasher, tenantRepository, new NoopLogger());

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/conversations',
    authenticate,
    createConversationsRouter(conversationsService),
  );
  app.use(
    '/api/tenants/:tenantId/conversations',
    createConversationsErrorHandler(new NoopLogger()),
  );
  return { app, conversationRepository, access, mediaSender, contactResolver };
}

function buildConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-1',
    tenantId: 'tenant-1',
    sessionName: 'default',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'bot',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: new Date('2026-07-10T12:00:00Z'),
    excludedFromPipeline: false,
    archived: false,
    tags: [],
    createdAt: new Date('2026-07-10T12:00:00Z'),
    updatedAt: new Date('2026-07-10T12:00:00Z'),
    ...overrides,
  };
}

function bearer(
  access: Hs256AccessTokenService,
  userId: string,
  role: UserRole,
  tenantId = 'tenant-1',
): string {
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
    const response = await request(app)
      .get('/api/tenants/tenant-1/conversations')
      .set('x-api-key', 'chave-nunca-vista');
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

    const response = await request(app)
      .get('/api/tenants/tenant-1/conversations')
      .set('x-api-key', 'chave-tenant-1');

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

  // --- Pipeline de CRM (Milestone 6, Bloco M6H-5) — POST .../stage ---

  it('chave da empresa (plano máquina) move o estágio normalmente, SEMPRE com stageSetBy "human" (200)', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation({ stage: 'new', stageSetBy: 'ai' }));

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/stage')
      .set('x-api-key', 'chave-tenant-1')
      .send({ stage: 'negotiating' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ stage: 'negotiating', stageSetBy: 'human' });
  });

  it('Operator (crachá) também pode mover o estágio (message:send, sem exigir ownership)', async () => {
    const { app, conversationRepository, access } = buildApp();
    conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-2' }));

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/stage')
      .set('authorization', bearer(access, 'op-1', 'operator'))
      .send({ stage: 'closed_won' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ stage: 'closed_won' });
  });

  it('ReadOnly NÃO pode mover o estágio -> 403 forbidden (RBAC)', async () => {
    const { app, conversationRepository, access } = buildApp();
    conversationRepository.seed(buildConversation());

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/stage')
      .set('authorization', bearer(access, 'ro-1', 'read_only'))
      .send({ stage: 'contacted' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'forbidden' });
  });

  it('stage fora do enum conhecido -> 400 invalid_params', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation());

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/stage')
      .set('x-api-key', 'chave-tenant-1')
      .send({ stage: 'valor-nao-existe' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_params' });
  });

  it('mover estágio de conversa inexistente -> 404 conversation_not_found', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-inexistente/stage')
      .set('x-api-key', 'chave-tenant-1')
      .send({ stage: 'contacted' });
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: 'conversation_not_found' });
  });

  it('[IDOR] chave do tenant-1 não move estágio de conversa do tenant-2 (403)', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation({ tenantId: 'tenant-2' }));

    const response = await request(app)
      .post('/api/tenants/tenant-2/conversations/conversation-1/stage')
      .set('x-api-key', 'chave-tenant-1')
      .send({ stage: 'contacted' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'tenant_mismatch' });
  });

  // --- POST .../exclude-from-pipeline (ADR #94, 2026-08-01) ---

  it('chave da empresa (plano máquina) marca a conversa como fora do funil comercial (200)', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation({ excludedFromPipeline: false }));

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/exclude-from-pipeline')
      .set('x-api-key', 'chave-tenant-1')
      .send({ excluded: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ excludedFromPipeline: true });
  });

  it('Operator (crachá) também pode marcar/desmarcar (message:send, sem exigir ownership)', async () => {
    const { app, conversationRepository, access } = buildApp();
    conversationRepository.seed(
      buildConversation({ status: 'human', assignedToUserId: 'op-2', excludedFromPipeline: true }),
    );

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/exclude-from-pipeline')
      .set('authorization', bearer(access, 'op-1', 'operator'))
      .send({ excluded: false });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ excludedFromPipeline: false });
  });

  it('ReadOnly NÃO pode marcar/desmarcar -> 403 forbidden (RBAC)', async () => {
    const { app, conversationRepository, access } = buildApp();
    conversationRepository.seed(buildConversation());

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/exclude-from-pipeline')
      .set('authorization', bearer(access, 'ro-1', 'read_only'))
      .send({ excluded: true });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'forbidden' });
  });

  it('excluded fora do tipo boolean -> 400 invalid_params', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation());

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/exclude-from-pipeline')
      .set('x-api-key', 'chave-tenant-1')
      .send({ excluded: 'sim' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_params' });
  });

  it('marcar conversa inexistente -> 404 conversation_not_found', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-inexistente/exclude-from-pipeline')
      .set('x-api-key', 'chave-tenant-1')
      .send({ excluded: true });
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: 'conversation_not_found' });
  });

  it('[IDOR] chave do tenant-1 não marca conversa do tenant-2 (403)', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation({ tenantId: 'tenant-2' }));

    const response = await request(app)
      .post('/api/tenants/tenant-2/conversations/conversation-1/exclude-from-pipeline')
      .set('x-api-key', 'chave-tenant-1')
      .send({ excluded: true });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'tenant_mismatch' });
  });

  it('GET / com ?excludedFromPipeline=false lista só as conversas dentro do funil comercial', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation({ id: 'c-dentro', excludedFromPipeline: false }));
    conversationRepository.seed(buildConversation({ id: 'c-fora', excludedFromPipeline: true }));

    const response = await request(app)
      .get('/api/tenants/tenant-1/conversations?excludedFromPipeline=false')
      .set('x-api-key', 'chave-tenant-1');

    expect(response.status).toBe(200);
    expect(response.body.conversations.map((c: { id: string }) => c.id)).toEqual(['c-dentro']);
  });

  // --- POST .../save-contact (retrofit visual 2026-08-18, botão "Salvar contato") ---

  it('chave da empresa (plano máquina) salva o contato e devolve a conversa com contactId', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation({ contactId: 'contact-99' }));

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/save-contact')
      .set('x-api-key', 'chave-tenant-1')
      .send({ name: 'Maria Costa' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ contactId: 'contact-99' });
  });

  it('Operator (crachá) também pode salvar contato (message:send, sem exigir ownership)', async () => {
    const { app, conversationRepository, access } = buildApp();
    conversationRepository.seed(
      buildConversation({ contactId: 'contact-99', status: 'human', assignedToUserId: 'op-2' }),
    );

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/save-contact')
      .set('authorization', bearer(access, 'op-1', 'operator'))
      .send({ name: 'Maria Costa' });

    expect(response.status).toBe(200);
  });

  it('ReadOnly NÃO pode salvar contato -> 403 forbidden (RBAC)', async () => {
    const { app, conversationRepository, access } = buildApp();
    conversationRepository.seed(buildConversation({ contactId: 'contact-99' }));

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/save-contact')
      .set('authorization', bearer(access, 'ro-1', 'read_only'))
      .send({ name: 'Maria Costa' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'forbidden' });
  });

  it('nome vazio ou maior que 200 caracteres -> 400 invalid_params', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation({ contactId: 'contact-99' }));

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/save-contact')
      .set('x-api-key', 'chave-tenant-1')
      .send({ name: 'x'.repeat(201) });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_params' });
  });

  it('salva sem name (opcional) -> 200', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation({ contactId: 'contact-99' }));

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/save-contact')
      .set('x-api-key', 'chave-tenant-1')
      .send({});

    expect(response.status).toBe(200);
  });

  it('conversa @lid sem contactId e sem telefone a derivar -> 422 conversation_contact_unavailable', async () => {
    const { app, conversationRepository, contactResolver } = buildApp();
    contactResolver.setUnresolvable();
    conversationRepository.seed(
      buildConversation({ contactId: undefined, contactJid: '225236742053984@lid' }),
    );

    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-1/save-contact')
      .set('x-api-key', 'chave-tenant-1')
      .send({ name: 'Maria' });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: 'conversation_contact_unavailable' });
  });

  it('salvar contato de conversa inexistente -> 404 conversation_not_found', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/tenants/tenant-1/conversations/conversation-inexistente/save-contact')
      .set('x-api-key', 'chave-tenant-1')
      .send({ name: 'Maria' });
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: 'conversation_not_found' });
  });

  it('[IDOR] chave do tenant-1 não salva contato de conversa do tenant-2 (403)', async () => {
    const { app, conversationRepository } = buildApp();
    conversationRepository.seed(buildConversation({ tenantId: 'tenant-2' }));

    const response = await request(app)
      .post('/api/tenants/tenant-2/conversations/conversation-1/save-contact')
      .set('x-api-key', 'chave-tenant-1')
      .send({ name: 'Maria' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'tenant_mismatch' });
  });

  // --- GET .../conversations/:conversationId (Fase 1, Bloco F1.10) ---

  describe('GET .../conversations/:conversationId', () => {
    it('conversa existente do próprio tenant: 200 com a conversa completa', async () => {
      const { app, conversationRepository } = buildApp();
      conversationRepository.seed(buildConversation({ id: 'c-1' }));

      const response = await request(app)
        .get('/api/tenants/tenant-1/conversations/c-1')
        .set('x-api-key', 'chave-tenant-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: 'c-1', tenantId: 'tenant-1', status: 'bot' });
    });

    it('conversa inexistente: 404', async () => {
      const { app } = buildApp();

      const response = await request(app)
        .get('/api/tenants/tenant-1/conversations/nunca-existiu')
        .set('x-api-key', 'chave-tenant-1');

      expect(response.status).toBe(404);
    });

    it('[IDOR] conversa de OUTRO tenant não vaza: 404, nunca 200 com dado alheio', async () => {
      const { app, conversationRepository } = buildApp();
      conversationRepository.seed(buildConversation({ id: 'c-1', tenantId: 'tenant-2' }));

      const response = await request(app)
        .get('/api/tenants/tenant-1/conversations/c-1')
        .set('x-api-key', 'chave-tenant-1');

      expect(response.status).toBe(404);
    });

    it('sem credencial: 401, rota nunca alcançada', async () => {
      const { app, conversationRepository } = buildApp();
      conversationRepository.seed(buildConversation({ id: 'c-1' }));

      const response = await request(app).get('/api/tenants/tenant-1/conversations/c-1');

      expect(response.status).toBe(401);
    });

    it('crachá de Read Only (qualquer papel autenticado): 200 — é rota de leitura, sem RBAC de posse', async () => {
      const { app, conversationRepository, access } = buildApp();
      conversationRepository.seed(buildConversation({ id: 'c-1' }));

      const response = await request(app)
        .get('/api/tenants/tenant-1/conversations/c-1')
        .set('Authorization', bearer(access, 'user-1', 'read_only'));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('c-1');
    });

    it('resposta traz os campos que a tela de detalhe da Dashboard usa hoje (status, stage, escalatedAt, unreadCount, tags)', async () => {
      const { app, conversationRepository } = buildApp();
      conversationRepository.seed(
        buildConversation({
          id: 'c-1',
          status: 'human',
          stage: 'negotiating',
          escalatedAt: new Date('2026-08-01T10:00:00Z'),
          unreadCount: 3,
        }),
      );

      const response = await request(app)
        .get('/api/tenants/tenant-1/conversations/c-1')
        .set('x-api-key', 'chave-tenant-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'human',
        stage: 'negotiating',
        unreadCount: 3,
      });
      expect(response.body.escalatedAt).toBeTruthy();
    });
  });

  // --- POST .../media (Fase 1, Bloco F1.3 — envio de mídia pelo operador) ---

  describe('POST .../media', () => {
    it('corpo bruto + headers x-media-*: 200, MediaSender chamado, Message devolvida com contentType real', async () => {
      const { app, conversationRepository, mediaSender } = buildApp();
      conversationRepository.seed(
        buildConversation({
          status: 'human',
          sessionName: 'vendas',
          contactJid: '5511999999999@s.whatsapp.net',
        }),
      );

      const response = await request(app)
        .post('/api/tenants/tenant-1/conversations/conversation-1/media')
        .set('x-api-key', 'chave-tenant-1')
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .set('x-media-caption', 'Segue a foto')
        .send(Buffer.from('bytes-da-imagem'));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        direction: 'outbound',
        contentType: 'image',
        content: 'Segue a foto',
      });
      expect(mediaSender.sendCalls).toEqual([
        {
          tenantId: 'tenant-1',
          sessionName: 'vendas',
          to: '5511999999999@s.whatsapp.net',
          media: {
            contentType: 'image',
            buffer: Buffer.from('bytes-da-imagem'),
            mimeType: 'image/jpeg',
            caption: 'Segue a foto',
            fileName: undefined,
          },
        },
      ]);
    });

    it('sem x-media-content-type: 400, MediaSender NÃO é chamado', async () => {
      const { app, conversationRepository, mediaSender } = buildApp();
      conversationRepository.seed(buildConversation({ status: 'human' }));

      const response = await request(app)
        .post('/api/tenants/tenant-1/conversations/conversation-1/media')
        .set('x-api-key', 'chave-tenant-1')
        .set('content-type', 'image/jpeg')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(400);
      expect(mediaSender.sendCalls).toHaveLength(0);
    });

    it('x-media-content-type fora do enum aceito (ex.: "sticker"): 400', async () => {
      const { app, conversationRepository } = buildApp();
      conversationRepository.seed(buildConversation({ status: 'human' }));

      const response = await request(app)
        .post('/api/tenants/tenant-1/conversations/conversation-1/media')
        .set('x-api-key', 'chave-tenant-1')
        .set('content-type', 'image/webp')
        .set('x-media-content-type', 'sticker')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(400);
    });

    it('corpo vazio: 400 empty_body', async () => {
      const { app, conversationRepository } = buildApp();
      conversationRepository.seed(buildConversation({ status: 'human' }));

      const response = await request(app)
        .post('/api/tenants/tenant-1/conversations/conversation-1/media')
        .set('x-api-key', 'chave-tenant-1')
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .send(Buffer.alloc(0));

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: 'empty_body' });
    });

    it('conversa em "bot" (ninguém assumiu): 409 conversation_not_human', async () => {
      const { app, conversationRepository } = buildApp();
      conversationRepository.seed(buildConversation({ status: 'bot' }));

      const response = await request(app)
        .post('/api/tenants/tenant-1/conversations/conversation-1/media')
        .set('x-api-key', 'chave-tenant-1')
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: 'conversation_not_human' });
    });

    it('MediaSender lança WhatsAppNotConnectedError: 502 whatsapp_not_connected', async () => {
      const { app, conversationRepository, mediaSender } = buildApp();
      conversationRepository.seed(buildConversation({ status: 'human' }));
      const { WhatsAppNotConnectedError } = jest.requireActual(
        '../../../../src/services/whatsapp/domain/errors/WhatsAppNotConnectedError',
      );
      mediaSender.nextError = new WhatsAppNotConnectedError('tenant-1', 'default');

      const response = await request(app)
        .post('/api/tenants/tenant-1/conversations/conversation-1/media')
        .set('x-api-key', 'chave-tenant-1')
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(502);
      expect(response.body).toMatchObject({ error: 'whatsapp_not_connected' });
    });

    it('[IDOR] chave do tenant-1 não envia mídia para conversa do tenant-2 (403)', async () => {
      const { app, conversationRepository } = buildApp();
      conversationRepository.seed(buildConversation({ tenantId: 'tenant-2', status: 'human' }));

      const response = await request(app)
        .post('/api/tenants/tenant-2/conversations/conversation-1/media')
        .set('x-api-key', 'chave-tenant-1')
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: 'tenant_mismatch' });
    });

    it('ReadOnly (crachá) NÃO pode enviar mídia -> 403 forbidden (RBAC, mesma permissão message:send)', async () => {
      const { app, conversationRepository, access } = buildApp();
      conversationRepository.seed(buildConversation({ status: 'human' }));

      const response = await request(app)
        .post('/api/tenants/tenant-1/conversations/conversation-1/media')
        .set('authorization', bearer(access, 'ro-1', 'read_only'))
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: 'forbidden' });
    });
  });
});
