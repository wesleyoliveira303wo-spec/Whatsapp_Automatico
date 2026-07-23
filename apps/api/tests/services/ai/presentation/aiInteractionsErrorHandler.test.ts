import { Request, Response, NextFunction } from 'express';
import { createAiInteractionsErrorHandler } from '../../../../src/services/ai/presentation/aiInteractionsErrorHandler';
import { TenantNotFoundError } from '../../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';

function buildRes(): Response {
  const res: Partial<Response> = {};
  res.headersSent = false;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('createAiInteractionsErrorHandler (Milestone 3, Bloco 5)', () => {
  it('mapeia TenantNotFoundError para 404', () => {
    const handler = createAiInteractionsErrorHandler(new NoopLogger());
    const res = buildRes();

    handler(new TenantNotFoundError('tenant-inexistente'), {} as Request, res, jest.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'tenant_not_found' }));
  });

  it('mapeia qualquer outro erro para 500 e loga via Logger.error', () => {
    const logger = new NoopLogger();
    jest.spyOn(logger, 'error');
    const handler = createAiInteractionsErrorHandler(logger);
    const res = buildRes();

    handler(new Error('falha inesperada'), {} as Request, res, jest.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'internal_error' }));
    expect(logger.error).toHaveBeenCalled();
  });

  it('se a resposta já foi enviada, repassa o erro adiante via next() em vez de responder de novo', () => {
    const handler = createAiInteractionsErrorHandler(new NoopLogger());
    const res = buildRes();
    res.headersSent = true;
    const next = jest.fn();

    const error = new Error('tarde demais');
    handler(error, {} as Request, res, next as NextFunction);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
