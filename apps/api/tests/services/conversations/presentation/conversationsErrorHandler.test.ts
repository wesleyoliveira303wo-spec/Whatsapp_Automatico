import { Request, Response, NextFunction } from 'express';
import { createConversationsErrorHandler } from '../../../../src/services/conversations/presentation/conversationsErrorHandler';
import { ConversationNotFoundError } from '../../../../src/services/conversations/domain/errors/ConversationNotFoundError';
import { TenantNotFoundError } from '../../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { AgentReplyRequiresPaidPlanError } from '../../../../src/services/conversations/domain/errors/AgentReplyRequiresPaidPlanError';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';

function buildRes(): Response {
  const res: Partial<Response> = {};
  res.headersSent = false;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('createConversationsErrorHandler (Milestone 3, Bloco 5)', () => {
  it('mapeia ConversationNotFoundError para 404', () => {
    const handler = createConversationsErrorHandler(new NoopLogger());
    const res = buildRes();

    handler(
      new ConversationNotFoundError('conversation-1'),
      {} as Request,
      res,
      jest.fn() as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'conversation_not_found' }),
    );
  });

  it('[D14] mapeia TenantNotFoundError para 404 (já nasce corrigido, sem o gap encontrado em whatsAppErrorHandler)', () => {
    const handler = createConversationsErrorHandler(new NoopLogger());
    const res = buildRes();

    handler(
      new TenantNotFoundError('tenant-inexistente'),
      {} as Request,
      res,
      jest.fn() as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'tenant_not_found' }));
  });

  it('[T2] mapeia AgentReplyRequiresPaidPlanError para 403 agent_reply_requires_paid_plan', () => {
    const handler = createConversationsErrorHandler(new NoopLogger());
    const res = buildRes();

    handler(
      new AgentReplyRequiresPaidPlanError(),
      {} as Request,
      res,
      jest.fn() as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'agent_reply_requires_paid_plan' }),
    );
  });

  it('mapeia qualquer outro erro para 500 e loga via Logger.error', () => {
    const logger = new NoopLogger();
    jest.spyOn(logger, 'error');
    const handler = createConversationsErrorHandler(logger);
    const res = buildRes();

    handler(new Error('falha inesperada'), {} as Request, res, jest.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'internal_error' }));
    expect(logger.error).toHaveBeenCalled();
  });

  it('se a resposta já foi enviada, repassa o erro adiante via next() em vez de responder de novo', () => {
    const handler = createConversationsErrorHandler(new NoopLogger());
    const res = buildRes();
    res.headersSent = true;
    const next = jest.fn();

    const error = new Error('tarde demais');
    handler(error, {} as Request, res, next as NextFunction);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
