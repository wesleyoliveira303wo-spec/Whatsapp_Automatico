import {
  createAuthenticate,
  RequestWithPrincipal,
} from '../../../src/shared/presentation/authenticate';
import { Hs256AccessTokenService } from '../../../src/services/auth/infrastructure/Hs256AccessTokenService';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeApiKeyHasher } from '../security/FakeApiKeyHasher';
import { FakeTenantRepository } from '../tenant/FakeTenantRepository';
import {
  FakeSupportAccessRepository,
  FakeSupportAccessTokenService,
} from '../../services/platform/testDoubles';
import type { Request, Response } from 'express';

const SECRET = 'segredo-de-teste-bem-comprido-1234567890';

function build() {
  const access = new Hs256AccessTokenService(SECRET, 900);
  const hasher = new FakeApiKeyHasher();
  const tenants = new FakeTenantRepository();
  const supportRepo = new FakeSupportAccessRepository();
  const supportTokens = new FakeSupportAccessTokenService();
  const authenticate = createAuthenticate(
    access,
    hasher,
    tenants,
    new NoopLogger(),
    supportTokens,
    supportRepo,
  );
  return { authenticate, supportRepo, supportTokens };
}

function fakeRes(): { res: Response; statusMock: jest.Mock; jsonMock: jest.Mock } {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  return {
    res: { status: statusMock, json: jsonMock } as unknown as Response,
    statusMock,
    jsonMock,
  };
}

function makeReq(headers: Record<string, string>, params: Record<string, string> = {}): Request {
  return {
    headers,
    params,
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('authenticate — plano SUPORTE (Fase 5 do /admin)', () => {
  it('acesso ACEITO e dentro do prazo → principal support + next', async () => {
    const { authenticate, supportRepo, supportTokens } = build();
    const row = supportRepo.seed({
      tenantId: 'tenant-1',
      platformUserId: 'admin-1',
      status: 'accepted',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const token = supportTokens.issue({
      supportAccessId: row.id,
      tenantId: 'tenant-1',
      platformUserId: 'admin-1',
    });
    const req = makeReq({ 'x-support-token': token }, { tenantId: 'tenant-1' });
    const { res } = fakeRes();
    const next = jest.fn();

    authenticate(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as RequestWithPrincipal).principal).toEqual({
      kind: 'support',
      tenantId: 'tenant-1',
      platformUserId: 'admin-1',
      supportAccessId: row.id,
    });
  });

  it('acesso REVOGADO → 403 (Regra 1: revalidado no banco a cada requisição)', async () => {
    const { authenticate, supportRepo, supportTokens } = build();
    const row = supportRepo.seed({
      tenantId: 'tenant-1',
      status: 'revoked',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const token = supportTokens.issue({
      supportAccessId: row.id,
      tenantId: 'tenant-1',
      platformUserId: 'admin-1',
    });
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    authenticate(makeReq({ 'x-support-token': token }, { tenantId: 'tenant-1' }), res, next);
    await flush();

    expect(next).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(403);
  });

  it('acesso EXPIRADO (status accepted mas expiresAt no passado) → 403 (Regra 3)', async () => {
    const { authenticate, supportRepo, supportTokens } = build();
    const row = supportRepo.seed({
      tenantId: 'tenant-1',
      status: 'accepted',
      expiresAt: new Date(Date.now() - 1000),
    });
    const token = supportTokens.issue({
      supportAccessId: row.id,
      tenantId: 'tenant-1',
      platformUserId: 'admin-1',
    });
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    authenticate(makeReq({ 'x-support-token': token }, { tenantId: 'tenant-1' }), res, next);
    await flush();

    expect(statusMock).toHaveBeenCalledWith(403);
  });

  it('token para o tenant A usado no path do tenant B → 403 tenant_mismatch', async () => {
    const { authenticate, supportRepo, supportTokens } = build();
    const row = supportRepo.seed({
      tenantId: 'tenant-A',
      status: 'accepted',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const token = supportTokens.issue({
      supportAccessId: row.id,
      tenantId: 'tenant-A',
      platformUserId: 'admin-1',
    });
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    authenticate(makeReq({ 'x-support-token': token }, { tenantId: 'tenant-B' }), res, next);
    await flush();

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('token inválido → 401', async () => {
    const { authenticate } = build();
    const { res, statusMock } = fakeRes();
    const next = jest.fn();
    authenticate(
      makeReq({ 'x-support-token': 'lixo' }, { tenantId: 'tenant-1' }),
      res,
      next,
    );
    await flush();
    expect(statusMock).toHaveBeenCalledWith(401);
  });

  it('plano support DESLIGADO (sem verifier) → 401 support_access_unavailable', async () => {
    const access = new Hs256AccessTokenService(SECRET, 900);
    const authenticate = createAuthenticate(
      access,
      new FakeApiKeyHasher(),
      new FakeTenantRepository(),
      new NoopLogger(),
    );
    const { res, statusMock, jsonMock } = fakeRes();
    const next = jest.fn();
    authenticate(
      makeReq({ 'x-support-token': 'qualquer' }, { tenantId: 'tenant-1' }),
      res,
      next,
    );
    await flush();
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'support_access_unavailable' }),
    );
  });
});
