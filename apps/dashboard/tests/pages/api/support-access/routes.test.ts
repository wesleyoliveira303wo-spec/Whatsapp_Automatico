import activeHandler from '../../../../pages/api/support-access/active';
import respondHandler from '../../../../pages/api/support-access/[id]/respond';
import revokeHandler from '../../../../pages/api/support-access/[id]/revoke';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callSupportAccessApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('BFF /api/support-access/* (Fase 5 — lado tenant)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockResolvedValue(SESSION);
  });

  it('GET /active repassa para /active da API', async () => {
    (callSupportAccessApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: { open: null, canRespond: false },
    });
    const res = createFakeRes();
    await activeHandler(createFakeReq({ method: 'GET' }), res);
    expect(callSupportAccessApi).toHaveBeenCalledWith(SESSION, '/active');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('GET /active sem sessão → não chama a API', async () => {
    (requireSession as jest.Mock).mockResolvedValue(null);
    const res = createFakeRes();
    await activeHandler(createFakeReq({ method: 'GET' }), res);
    expect(callSupportAccessApi).not.toHaveBeenCalled();
  });

  it('POST /:id/respond repassa o id no path e o corpo', async () => {
    (callSupportAccessApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: { request: { status: 'accepted' } },
    });
    const res = createFakeRes();
    await respondHandler(
      createFakeReq({ method: 'POST', query: { id: 'sa-1' }, body: { decision: 'accept' } }),
      res,
    );
    expect(callSupportAccessApi).toHaveBeenCalledWith(SESSION, '/sa-1/respond', {
      method: 'POST',
      body: { decision: 'accept' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('POST /:id/respond sem id → 400', async () => {
    const res = createFakeRes();
    await respondHandler(createFakeReq({ method: 'POST', query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(callSupportAccessApi).not.toHaveBeenCalled();
  });

  it('POST /:id/revoke repassa para /:id/revoke da API', async () => {
    (callSupportAccessApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: { request: { status: 'revoked' } },
    });
    const res = createFakeRes();
    await revokeHandler(createFakeReq({ method: 'POST', query: { id: 'sa-1' } }), res);
    expect(callSupportAccessApi).toHaveBeenCalledWith(SESSION, '/sa-1/revoke', { method: 'POST' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('GET /active recusa método não-GET', async () => {
    const res = createFakeRes();
    await activeHandler(createFakeReq({ method: 'POST' }), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
