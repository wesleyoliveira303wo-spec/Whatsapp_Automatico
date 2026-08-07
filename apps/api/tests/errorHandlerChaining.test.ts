import express, { Express } from 'express';
import request from 'supertest';
import { createWhatsAppErrorHandler } from '../src/services/whatsapp/presentation/whatsAppErrorHandler';
import { createConversationsErrorHandler } from '../src/services/conversations/presentation/conversationsErrorHandler';
import { ConversationNotFoundError } from '../src/services/conversations/domain/errors/ConversationNotFoundError';
import { WhatsAppSessionNotFoundError } from '../src/services/whatsapp/domain/errors/WhatsAppSessionNotFoundError';
import { NoopLogger } from '../src/shared/infrastructure/logging/NoopLogger';

/**
 * Regressão do D17 (levantamento arquitetural do Bloco 5) — prova, com um
 * app Express real, que montar múltiplos error handlers ESCOPADOS POR PATH
 * (`app.use(path, handler)`, o padrão que `index.ts` adota a partir deste
 * bloco) NÃO reproduz o bug de encadeamento que existiria se eles fossem
 * montados globalmente (`app.use(handler)`, sem path — o padrão de
 * `index.ts` ANTES deste bloco).
 *
 * `whatsAppErrorHandler` nunca chama `next(error)` para um erro desconhecido
 * (só no caso `headersSent`) — por isso, se montado globalmente ANTES de
 * `conversationsErrorHandler`, ele engoliria um `ConversationNotFoundError`
 * vindo de `/conversations` num 500 genérico, e o handler correto nunca
 * seria alcançado. Path-scoping evita isso por construção: o Express só
 * invoca um error handler escopado por path para erros ocorridos DENTRO
 * daquele path.
 */
function buildApp(): Express {
  const app = express();

  app.get('/api/tenants/:tenantId/whatsapp-sessions/boom', () => {
    throw new WhatsAppSessionNotFoundError('sessao-x');
  });
  app.use('/api/tenants/:tenantId/whatsapp-sessions', createWhatsAppErrorHandler(new NoopLogger()));

  app.get('/api/tenants/:tenantId/conversations/boom', () => {
    throw new ConversationNotFoundError('conversation-x');
  });
  app.use(
    '/api/tenants/:tenantId/conversations',
    createConversationsErrorHandler(new NoopLogger()),
  );

  return app;
}

describe('Encadeamento de error handlers path-scoped (Milestone 3, Bloco 5 — D17)', () => {
  it('um erro de /conversations é tratado por conversationsErrorHandler (404 conversation_not_found), não engolido por whatsAppErrorHandler', async () => {
    const app = buildApp();

    const response = await request(app).get('/api/tenants/tenant-1/conversations/boom');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: 'conversation_not_found' });
  });

  it('um erro de /whatsapp-sessions continua tratado por whatsAppErrorHandler (404 session_not_found)', async () => {
    const app = buildApp();

    const response = await request(app).get('/api/tenants/tenant-1/whatsapp-sessions/boom');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: 'session_not_found' });
  });
});
