import { requirePermission } from '../../../src/shared/presentation/requirePermission';
import { RequestWithPrincipal } from '../../../src/shared/presentation/authenticate';
import type { Response } from 'express';

function fakeRes(): { res: Response; statusMock: jest.Mock; jsonMock: jest.Mock } {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  return {
    res: { status: statusMock, json: jsonMock } as unknown as Response,
    statusMock,
    jsonMock,
  };
}

describe('requirePermission (Milestone 5, Bloco M5D)', () => {
  it('plano MAQUINA (chave da empresa) libera tudo', () => {
    const req = {
      principal: { kind: 'machine', tenantId: 'tenant-1' },
    } as unknown as RequestWithPrincipal;
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    requirePermission('user:create')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('plano PESSOA COM a permissao: libera', () => {
    const req = {
      principal: { kind: 'user', userId: 'u', tenantId: 't', role: 'operator' },
    } as unknown as RequestWithPrincipal;
    const { res } = fakeRes();
    const next = jest.fn();

    requirePermission('conversation:escalate')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('plano PESSOA SEM a permissao: 403', () => {
    const req = {
      principal: { kind: 'user', userId: 'u', tenantId: 't', role: 'operator' },
    } as unknown as RequestWithPrincipal;
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    requirePermission('user:create')(req, res, next);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('sem principal (authenticate nao rodou): 401', () => {
    const req = {} as unknown as RequestWithPrincipal;
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    requirePermission('conversation:read')(req, res, next);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
