import { createSupportAccessAuditMiddleware } from '../../../../src/services/platform/presentation/supportAccessAuditMiddleware';
import { RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { FakeAuditLogRepository } from '../../auth/testDoubles';
import { fakeLogger } from '../testDoubles';
import type { Request, Response } from 'express';

function req(
  method: string,
  principal: RequestWithPrincipal['principal'] | undefined,
): Request {
  return {
    method,
    headers: { 'user-agent': 'jest' },
    ip: '10.0.0.1',
    baseUrl: '/api/tenants/t-1',
    path: '/conversations/c-1/messages',
    principal,
  } as unknown as Request;
}

const res = {} as Response;

const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('supportAccessAuditMiddleware', () => {
  const SUPPORT: RequestWithPrincipal['principal'] = {
    kind: 'support',
    tenantId: 't-1',
    platformUserId: 'admin-1',
    supportAccessId: 'sa-1',
  };

  it('ator support + método MUTANTE → grava support.action no AuditLog do tenant', async () => {
    const audit = new FakeAuditLogRepository();
    const mw = createSupportAccessAuditMiddleware(audit, fakeLogger());
    const next = jest.fn();

    mw(req('POST', SUPPORT), res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    const [entry] = audit.all();
    expect(entry).toMatchObject({
      tenantId: 't-1',
      action: 'support.action',
      metadata: {
        supportAccessId: 'sa-1',
        platformUserId: 'admin-1',
        method: 'POST',
        path: '/api/tenants/t-1/conversations/c-1/messages',
      },
    });
  });

  it('ator support + GET → não grava nada', async () => {
    const audit = new FakeAuditLogRepository();
    const mw = createSupportAccessAuditMiddleware(audit, fakeLogger());
    const next = jest.fn();

    mw(req('GET', SUPPORT), res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(audit.all()).toHaveLength(0);
  });

  it('ator user (não-support) + POST → não grava nada', async () => {
    const audit = new FakeAuditLogRepository();
    const mw = createSupportAccessAuditMiddleware(audit, fakeLogger());
    const next = jest.fn();

    mw(
      req('POST', { kind: 'user', userId: 'u', tenantId: 't-1', role: 'owner' }),
      res,
      next,
    );
    await flush();

    expect(audit.all()).toHaveLength(0);
  });

  it('falha ao gravar não derruba a requisição', async () => {
    const audit = new FakeAuditLogRepository();
    jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('banco fora'));
    const mw = createSupportAccessAuditMiddleware(audit, fakeLogger());
    const next = jest.fn();

    mw(req('POST', SUPPORT), res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
  });
});
