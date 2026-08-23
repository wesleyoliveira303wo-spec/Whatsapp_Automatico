import {
  createAuthenticate,
  RequestWithPrincipal,
} from '../../../src/shared/presentation/authenticate';
import { Hs256AccessTokenService } from '../../../src/services/auth/infrastructure/Hs256AccessTokenService';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeApiKeyHasher } from '../security/FakeApiKeyHasher';
import { FakeTenantRepository } from '../tenant/FakeTenantRepository';
import type { Request, Response } from 'express';

const SECRET = 'segredo-de-teste-bem-comprido-1234567890';

function build(): {
  authenticate: ReturnType<typeof createAuthenticate>;
  access: Hs256AccessTokenService;
} {
  const access = new Hs256AccessTokenService(SECRET, 900);
  const hasher = new FakeApiKeyHasher();
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: hasher.hash('chave-1') });
  const authenticate = createAuthenticate(access, hasher, tenants, new NoopLogger());
  return { authenticate, access };
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

/** Espera o proximo tick — o caminho da API key resolve de forma assincrona. */
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('createAuthenticate (Milestone 5, Bloco M5D)', () => {
  it('crachá valido -> principal user + next', async () => {
    const { authenticate, access } = build();
    const token = access.issue({ userId: 'u1', tenantId: 'tenant-1', role: 'operator' });
    const req = makeReq({ authorization: `Bearer ${token}` }, { tenantId: 'tenant-1' });
    const { res } = fakeRes();
    const next = jest.fn();

    authenticate(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as RequestWithPrincipal).principal).toEqual({
      kind: 'user',
      userId: 'u1',
      tenantId: 'tenant-1',
      role: 'operator',
    });
  });

  it('API key valida -> principal machine + next', async () => {
    const { authenticate } = build();
    const req = makeReq({ 'x-api-key': 'chave-1' }, { tenantId: 'tenant-1' });
    const { res } = fakeRes();
    const next = jest.fn();

    authenticate(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as RequestWithPrincipal).principal).toEqual({
      kind: 'machine',
      tenantId: 'tenant-1',
    });
  });

  it('sem crachá e sem API key -> 401', async () => {
    const { authenticate } = build();
    const req = makeReq({}, { tenantId: 'tenant-1' });
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    authenticate(req, res, next);
    await flush();

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('crachá invalido -> 401', async () => {
    const { authenticate } = build();
    const req = makeReq({ authorization: 'Bearer lixo.invalido.aqui' }, { tenantId: 'tenant-1' });
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    authenticate(req, res, next);
    await flush();

    expect(statusMock).toHaveBeenCalledWith(401);
  });

  it('API key invalida -> 401', async () => {
    const { authenticate } = build();
    const req = makeReq({ 'x-api-key': 'chave-errada' }, { tenantId: 'tenant-1' });
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    authenticate(req, res, next);
    await flush();

    expect(statusMock).toHaveBeenCalledWith(401);
  });

  it('[IDOR] crachá de tenant-1 acessando tenant-2 -> 403', async () => {
    const { authenticate, access } = build();
    const token = access.issue({ userId: 'u1', tenantId: 'tenant-1', role: 'operator' });
    const req = makeReq({ authorization: `Bearer ${token}` }, { tenantId: 'tenant-2' });
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    authenticate(req, res, next);
    await flush();

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('[IDOR] API key de tenant-1 acessando tenant-2 -> 403', async () => {
    const { authenticate } = build();
    const req = makeReq({ 'x-api-key': 'chave-1' }, { tenantId: 'tenant-2' });
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    authenticate(req, res, next);
    await flush();

    expect(statusMock).toHaveBeenCalledWith(403);
  });

  /**
   * Onda 3 do redesign (2026-08-23) — trava de regressão: `tenantMatches`
   * falhava ABERTO quando a rota não tinha `:tenantId` no path (devolvia
   * `true`, liberava). Hoje é inofensivo porque todo mount de `authenticate`
   * vive sob `/api/tenants/:tenantId/...`, mas uma rota futura montada sem
   * esse prefixo herdaria acesso cross-tenant por omissão em vez de ser
   * barrada por padrão. Este teste prova o comportamento seguro (fail-closed)
   * diretamente, sem depender de nenhuma rota real ficar mal configurada.
   */
  it('[IDOR] sem :tenantId no path -> 403, nunca libera por omissão (fail-closed)', async () => {
    const { authenticate, access } = build();
    const token = access.issue({ userId: 'u1', tenantId: 'tenant-1', role: 'operator' });
    const req = makeReq({ authorization: `Bearer ${token}` }, {});
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    authenticate(req, res, next);
    await flush();

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
