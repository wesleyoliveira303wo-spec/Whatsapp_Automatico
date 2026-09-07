import express from 'express';
import request from 'supertest';

import { createPlatformSupportRouter } from '../../../../src/services/platform/presentation/platformSupportRouter';
import { createTenantSupportAccessRouter } from '../../../../src/services/platform/presentation/tenantSupportAccessRouter';
import { createSupportAccessErrorHandler } from '../../../../src/services/platform/presentation/supportAccessErrorHandler';
import { createPlatformErrorHandler } from '../../../../src/services/platform/presentation/platformErrorHandler';
import { SupportAccessService } from '../../../../src/services/platform/application/SupportAccessService';
import { RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { FakeAuditLogRepository } from '../../auth/testDoubles';
import {
  FakePlatformAuditLogRepository,
  FakePlatformUserRepository,
  FakeSupportAccessRepository,
  FakeSupportAccessTokenService,
  fakeLogger,
} from '../testDoubles';
import type { NextFunction, Request, Response } from 'express';

function buildService() {
  const requests = new FakeSupportAccessRepository();
  const users = new FakePlatformUserRepository();
  users.seed({ id: 'admin-1', name: 'Dono', email: 'dono@francis.app' });
  const service = new SupportAccessService(
    requests,
    new FakePlatformAuditLogRepository(),
    new FakeAuditLogRepository(),
    new FakeSupportAccessTokenService(),
    users,
    fakeLogger(),
  );
  return { requests, service };
}

/** Porteiro de plataforma de mentira — injeta `req.platformUser`. */
function fakePlatformGuard(req: Request, _res: Response, next: NextFunction): void {
  (req as unknown as { platformUser: { id: string } }).platformUser = { id: 'admin-1' };
  next();
}

/** `authenticate` de mentira — injeta um principal conforme o header `x-role`. */
function fakeAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const role = req.headers['x-role'];
  if (role === 'machine') {
    (req as RequestWithPrincipal).principal = { kind: 'machine', tenantId: req.params.tenantId };
  } else if (typeof role === 'string') {
    (req as RequestWithPrincipal).principal = {
      kind: 'user',
      userId: 'user-9',
      tenantId: req.params.tenantId,
      role: role as never,
    };
  }
  next();
}

describe('platformSupportRouter', () => {
  function app() {
    const { requests, service } = buildService();
    const a = express();
    a.use(express.json());
    a.use('/api/platform', createPlatformSupportRouter(service, fakePlatformGuard));
    a.use('/api/platform', createPlatformErrorHandler(fakeLogger()));
    return { a, requests };
  }

  it('POST /support cria um pedido', async () => {
    const { a } = app();
    const res = await request(a)
      .post('/api/platform/support')
      .send({ tenantId: 't-1', reason: 'ver a IA' });
    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({ tenantId: 't-1', status: 'pending' });
  });

  it('POST /support sem motivo → 400', async () => {
    const { a } = app();
    const res = await request(a).post('/api/platform/support').send({ tenantId: 't-1' });
    expect(res.status).toBe(400);
  });

  it('POST /support com um pedido já aberto → 409', async () => {
    const { a, requests } = app();
    requests.seed({ tenantId: 't-1', status: 'pending' });
    const res = await request(a)
      .post('/api/platform/support')
      .send({ tenantId: 't-1', reason: 'x' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'support_access_already_open' });
  });

  it('POST /support/:id/token de um acesso não aceito → 409', async () => {
    const { a, requests } = app();
    const row = requests.seed({ platformUserId: 'admin-1', status: 'pending' });
    const res = await request(a).post(`/api/platform/support/${row.id}/token`);
    expect(res.status).toBe(409);
  });
});

describe('tenantSupportAccessRouter', () => {
  function app() {
    const { requests, service } = buildService();
    const a = express();
    a.use(express.json());
    a.use(
      '/api/tenants/:tenantId/support-access',
      fakeAuthenticate,
      createTenantSupportAccessRouter(service),
    );
    a.use('/api/tenants/:tenantId/support-access', createSupportAccessErrorHandler(fakeLogger()));
    return { a, requests };
  }

  it('GET /active devolve o pedido pendente + canRespond por cargo', async () => {
    const { a, requests } = app();
    requests.seed({ tenantId: 't-1', status: 'pending' });

    const owner = await request(a)
      .get('/api/tenants/t-1/support-access/active')
      .set('x-role', 'owner');
    expect(owner.body.open).toMatchObject({ status: 'pending' });
    expect(owner.body.canRespond).toBe(true);

    const operator = await request(a)
      .get('/api/tenants/t-1/support-access/active')
      .set('x-role', 'operator');
    expect(operator.body.canRespond).toBe(false);
  });

  it('POST /:id/respond exige cargo com support:respond', async () => {
    const { a, requests } = app();
    const row = requests.seed({ tenantId: 't-1', status: 'pending' });

    const denied = await request(a)
      .post(`/api/tenants/t-1/support-access/${row.id}/respond`)
      .set('x-role', 'operator')
      .send({ decision: 'accept' });
    expect(denied.status).toBe(403);

    const ok = await request(a)
      .post(`/api/tenants/t-1/support-access/${row.id}/respond`)
      .set('x-role', 'administrator')
      .send({ decision: 'accept' });
    expect(ok.status).toBe(200);
    expect(ok.body.request.status).toBe('accepted');
  });

  it('POST /:id/respond pela API key (plano máquina) → 403 human_required', async () => {
    const { a, requests } = app();
    const row = requests.seed({ tenantId: 't-1', status: 'pending' });
    const res = await request(a)
      .post(`/api/tenants/t-1/support-access/${row.id}/respond`)
      .set('x-role', 'machine')
      .send({ decision: 'accept' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'human_required' });
  });

  it('IDOR: responder um pedido de OUTRO tenant pelo path deste → 403', async () => {
    const { a, requests } = app();
    const row = requests.seed({ tenantId: 't-OUTRO', status: 'pending' });
    const res = await request(a)
      .post(`/api/tenants/t-1/support-access/${row.id}/respond`)
      .set('x-role', 'owner')
      .send({ decision: 'accept' });
    expect(res.status).toBe(403);
  });

  it('revoke de um acesso vivo → 200 revoked (Regra 2)', async () => {
    const { a, requests } = app();
    const row = requests.seed({
      tenantId: 't-1',
      status: 'accepted',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const res = await request(a)
      .post(`/api/tenants/t-1/support-access/${row.id}/revoke`)
      .set('x-role', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('revoked');
  });
});
