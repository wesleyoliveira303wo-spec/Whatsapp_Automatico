import { Request, Response, NextFunction } from 'express';
import { createWhatsAppErrorHandler } from '../../../../src/services/whatsapp/presentation/whatsAppErrorHandler';
import { WhatsAppSessionNotFoundError } from '../../../../src/services/whatsapp/domain/errors/WhatsAppSessionNotFoundError';
import { WhatsAppQRCodeNotAvailableError } from '../../../../src/services/whatsapp/domain/errors/WhatsAppQRCodeNotAvailableError';
import { TenantNotFoundError } from '../../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';

function buildRes(): Response {
  const res: Partial<Response> = {};
  res.headersSent = false;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('createWhatsAppErrorHandler', () => {
  it('mapeia WhatsAppSessionNotFoundError para 404', () => {
    const handler = createWhatsAppErrorHandler(new NoopLogger());
    const res = buildRes();

    handler(new WhatsAppSessionNotFoundError('x'), {} as Request, res, jest.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'session_not_found' }));
  });

  it('mapeia WhatsAppQRCodeNotAvailableError para 409', () => {
    const handler = createWhatsAppErrorHandler(new NoopLogger());
    const res = buildRes();

    handler(new WhatsAppQRCodeNotAvailableError('tenant-1', 'vendas'), {} as Request, res, jest.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'qr_code_not_available' }));
  });

  it('[D14 - bug corrigido no Bloco 5] mapeia TenantNotFoundError para 404, em vez de cair no 500 generico', () => {
    const handler = createWhatsAppErrorHandler(new NoopLogger());
    const res = buildRes();

    handler(new TenantNotFoundError('tenant-inexistente'), {} as Request, res, jest.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'tenant_not_found' }));
  });

  it('mapeia qualquer outro erro para 500 e loga via Logger.error', () => {
    const logger = new NoopLogger();
    jest.spyOn(logger, 'error');
    const handler = createWhatsAppErrorHandler(logger);
    const res = buildRes();

    handler(new Error('falha inesperada'), {} as Request, res, jest.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'internal_error' }));
    expect(logger.error).toHaveBeenCalled();
  });

  it('se a resposta ja foi enviada, repassa o erro adiante via next() em vez de responder de novo', () => {
    const handler = createWhatsAppErrorHandler(new NoopLogger());
    const res = buildRes();
    res.headersSent = true;
    const next = jest.fn();

    const error = new Error('tarde demais');
    handler(error, {} as Request, res, next as NextFunction);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
