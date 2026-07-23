import { createAnalyticsErrorHandler } from '../../../../src/services/analytics/presentation/analyticsErrorHandler';
import { InvalidAnalyticsRangeError } from '../../../../src/services/analytics/domain/errors/InvalidAnalyticsRangeError';
import { TenantNotFoundError } from '../../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import type { Request, Response } from 'express';

function fakeRes(): { res: Response; statusMock: jest.Mock; jsonMock: jest.Mock; headersSent: boolean } {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  const res = { headersSent: false, status: statusMock, json: jsonMock } as unknown as Response;
  return { res, statusMock, jsonMock, headersSent: false };
}

describe('createAnalyticsErrorHandler (Milestone 4, Bloco M4C)', () => {
  const handler = createAnalyticsErrorHandler(new NoopLogger());

  it('InvalidAnalyticsRangeError -> 400 invalid_analytics_range', () => {
    const { res, statusMock, jsonMock } = fakeRes();
    handler(new InvalidAnalyticsRangeError('faixa ruim'), {} as Request, res, jest.fn());
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_analytics_range' }));
  });

  it('TenantNotFoundError -> 404 tenant_not_found (convencao do projeto)', () => {
    const { res, statusMock, jsonMock } = fakeRes();
    handler(new TenantNotFoundError('tenant-x'), {} as Request, res, jest.fn());
    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: 'tenant_not_found' }));
  });

  it('erro desconhecido -> 500 internal_error', () => {
    const { res, statusMock, jsonMock } = fakeRes();
    handler(new Error('surpresa'), {} as Request, res, jest.fn());
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: 'internal_error' }));
  });

  it('quando headersSent, delega ao next sem responder (nao engole o erro)', () => {
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    const res = { headersSent: true, status: statusMock, json: jsonMock } as unknown as Response;
    const next = jest.fn();

    handler(new InvalidAnalyticsRangeError('x'), {} as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusMock).not.toHaveBeenCalled();
  });
});
