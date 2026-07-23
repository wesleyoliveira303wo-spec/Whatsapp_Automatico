import { createRequireUser, RequestWithAuthUser } from '../../../src/shared/presentation/requireUser';
import { Hs256AccessTokenService } from '../../../src/services/auth/infrastructure/Hs256AccessTokenService';
import type { Request, Response } from 'express';

const SECRET = 'segredo-de-teste-bem-comprido-1234567890';

function fakeRes(): { res: Response; statusMock: jest.Mock; jsonMock: jest.Mock } {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  const res = { status: statusMock, json: jsonMock } as unknown as Response;
  return { res, statusMock, jsonMock };
}

describe('createRequireUser (Milestone 5, Bloco M5C)', () => {
  const access = new Hs256AccessTokenService(SECRET, 900);
  const requireUser = createRequireUser(access);

  it('cracha valido: anexa req.authUser e chama next()', () => {
    const token = access.issue({ userId: 'user-1', tenantId: 'tenant-1', role: 'operator' });
    const req = { headers: { authorization: `Bearer ${token}` }, params: {} } as unknown as Request;
    const { res } = fakeRes();
    const next = jest.fn();

    requireUser(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as RequestWithAuthUser).authUser).toEqual({ userId: 'user-1', tenantId: 'tenant-1', role: 'operator' });
  });

  it('sem header Authorization: 401', () => {
    const req = { headers: {}, params: {} } as unknown as Request;
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    requireUser(req, res, next);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('cracha invalido/adulterado: 401', () => {
    const req = { headers: { authorization: 'Bearer lixo.invalido.aqui' }, params: {} } as unknown as Request;
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    requireUser(req, res, next);

    expect(statusMock).toHaveBeenCalledWith(401);
  });

  it('[IDOR] cracha de um tenant nao acessa rota de OUTRO tenant: 403', () => {
    const token = access.issue({ userId: 'user-1', tenantId: 'tenant-1', role: 'operator' });
    const req = { headers: { authorization: `Bearer ${token}` }, params: { tenantId: 'tenant-2' } } as unknown as Request;
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    requireUser(req, res, next);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
