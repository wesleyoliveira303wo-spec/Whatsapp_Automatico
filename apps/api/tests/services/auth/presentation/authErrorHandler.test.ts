import { createAuthErrorHandler } from '../../../../src/services/auth/presentation/authErrorHandler';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import type { Request, Response } from 'express';

describe('createAuthErrorHandler (Milestone 5, Bloco M5C)', () => {
  const handler = createAuthErrorHandler(new NoopLogger());

  it('erro inesperado -> 500 internal_error', () => {
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    const res = { headersSent: false, status: statusMock, json: jsonMock } as unknown as Response;

    handler(new Error('surpresa'), {} as Request, res, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: 'internal_error' }));
  });

  it('quando headersSent, delega ao next sem responder', () => {
    const statusMock = jest.fn();
    const res = { headersSent: true, status: statusMock } as unknown as Response;
    const next = jest.fn();

    handler(new Error('x'), {} as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusMock).not.toHaveBeenCalled();
  });
});
