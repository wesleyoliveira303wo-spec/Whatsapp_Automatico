import express from 'express';
import request from 'supertest';

import { createConversationSummaryRouter } from '../../../../src/services/ai/presentation/conversationSummaryRouter';
import { createConversationSummaryErrorHandler } from '../../../../src/services/ai/presentation/conversationSummaryErrorHandler';
import { ConversationSummaryService } from '../../../../src/services/ai/application/ConversationSummaryService';
import { Conversation } from '../../../../src/services/conversations/domain/entities/Conversation';
import { Principal, RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeConversationRepository, FakeMessageRepository } from '../../conversations/testDoubles';
import { FakeAiInteractionRepository } from '../infrastructure/FakeAiInteractionRepository';
import { FakeAiProvider } from '../infrastructure/FakeAiProviderFactory';

/**
 * Testes do conversationSummaryRouter (Redesign 2026-08-05, R5): RBAC
 * (`message:send`) + mapeamento de erros. Principal injetado por
 * middleware, mesmo padrão de `conversationTagRouter.test.ts` — o
 * `authenticate` real já é coberto em `authenticate.test.ts`.
 *
 * Mount FLAT: `/api/tenants/:tenantId/conversations/:conversationId/summary`.
 */
const TENANT_ID = 'tenant-1';
const CONVERSATION_ID = 'conversation-1';

function buildConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: CONVERSATION_ID,
    tenantId: TENANT_ID,
    sessionName: 'default',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'bot',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: new Date('2026-08-06T12:00:00Z'),
    excludedFromPipeline: false,
    archived: false,
    tags: [],
    aiSummaryMessageCount: 0,
    createdAt: new Date('2026-08-06T12:00:00Z'),
    updatedAt: new Date('2026-08-06T12:00:00Z'),
    ...overrides,
  };
}

function buildApp(
  principal: Principal | undefined,
  options: { withProvider?: boolean } = {},
): {
  app: express.Express;
  conversationRepository: FakeConversationRepository;
  messageRepository: FakeMessageRepository;
  aiProvider: FakeAiProvider;
} {
  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();
  const aiInteractionRepository = new FakeAiInteractionRepository();
  const aiProvider = new FakeAiProvider();
  const { withProvider = true } = options;

  const service = new ConversationSummaryService(
    conversationRepository,
    messageRepository,
    aiInteractionRepository,
    'gemini',
    new NoopLogger(),
    withProvider ? aiProvider : undefined,
  );

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/conversations',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createConversationSummaryRouter(service),
  );
  app.use(
    '/api/tenants/:tenantId/conversations',
    createConversationSummaryErrorHandler(new NoopLogger()),
  );
  return { app, conversationRepository, messageRepository, aiProvider };
}

function person(role: UserRole): Principal {
  return { kind: 'user', userId: 'user-1', tenantId: TENANT_ID, role };
}
const MACHINE: Principal = { kind: 'machine', tenantId: TENANT_ID };

function summaryPath(tenantId: string, conversationId = CONVERSATION_ID): string {
  return `/api/tenants/${tenantId}/conversations/${conversationId}/summary`;
}

describe('conversationSummaryRouter (Redesign 2026-08-05, R5)', () => {
  it('operator gera o resumo (200) com a Conversation atualizada', async () => {
    const { app, conversationRepository, messageRepository, aiProvider } = buildApp(
      person('operator'),
    );
    conversationRepository.seed(buildConversation());
    await messageRepository.create({
      tenantId: TENANT_ID,
      conversationId: CONVERSATION_ID,
      direction: 'inbound',
      content: 'Olá',
      contentType: 'text',
      occurredAt: new Date(),
    });
    aiProvider.setNextResult({
      content: 'Resumo gerado.',
      model: 'gemini-3.5-flash',
      tokensInput: 10,
      tokensOutput: 5,
    });

    const response = await request(app).post(summaryPath(TENANT_ID));

    expect(response.status).toBe(200);
    expect(response.body.aiSummary).toBe('Resumo gerado.');
  });

  it('read_only NÃO pode gerar resumo (403 — sem message:send)', async () => {
    const { app, conversationRepository } = buildApp(person('read_only'));
    conversationRepository.seed(buildConversation());

    const response = await request(app).post(summaryPath(TENANT_ID));

    expect(response.status).toBe(403);
  });

  it('plano máquina gera normalmente (200)', async () => {
    const { app, conversationRepository, messageRepository } = buildApp(MACHINE);
    conversationRepository.seed(buildConversation());
    await messageRepository.create({
      tenantId: TENANT_ID,
      conversationId: CONVERSATION_ID,
      direction: 'inbound',
      content: 'Olá',
      contentType: 'text',
      occurredAt: new Date(),
    });

    const response = await request(app).post(summaryPath(TENANT_ID));

    expect(response.status).toBe(200);
  });

  it('devolve 404 quando a conversa não existe', async () => {
    const { app } = buildApp(person('operator'));

    const response = await request(app).post(summaryPath(TENANT_ID, 'conversa-inexistente'));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('conversation_not_found');
  });

  it('devolve 404 quando a conversa é de outro tenant (IDOR-safe)', async () => {
    const { app, conversationRepository } = buildApp(person('operator'));
    conversationRepository.seed(buildConversation({ tenantId: 'tenant-2' }));

    const response = await request(app).post(summaryPath(TENANT_ID));

    expect(response.status).toBe(404);
  });

  it('devolve 400 quando a conversa não tem mensagens', async () => {
    const { app, conversationRepository } = buildApp(person('operator'));
    conversationRepository.seed(buildConversation());

    const response = await request(app).post(summaryPath(TENANT_ID));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('conversation_summary_unavailable');
  });

  it('devolve 503 quando o AiProvider não está configurado', async () => {
    const { app, conversationRepository, messageRepository } = buildApp(person('operator'), {
      withProvider: false,
    });
    conversationRepository.seed(buildConversation());
    await messageRepository.create({
      tenantId: TENANT_ID,
      conversationId: CONVERSATION_ID,
      direction: 'inbound',
      content: 'Olá',
      contentType: 'text',
      occurredAt: new Date(),
    });

    const response = await request(app).post(summaryPath(TENANT_ID));

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('ai_provider_not_configured');
  });

  it('devolve 502 quando o provider falha (ex.: 503 do Gemini)', async () => {
    const { app, conversationRepository, messageRepository, aiProvider } = buildApp(
      person('operator'),
    );
    conversationRepository.seed(buildConversation());
    await messageRepository.create({
      tenantId: TENANT_ID,
      conversationId: CONVERSATION_ID,
      direction: 'inbound',
      content: 'Olá',
      contentType: 'text',
      occurredAt: new Date(),
    });
    aiProvider.setNextError(new Error('Gemini API respondeu 503: sobrecarregado'));

    const response = await request(app).post(summaryPath(TENANT_ID));

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('ai_summary_generation_failed');
  });
});
