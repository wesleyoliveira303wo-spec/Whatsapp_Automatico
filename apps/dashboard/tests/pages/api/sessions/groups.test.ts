import handler from '../../../../pages/api/sessions/[sessionName]/groups';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

/** Disparos em grupos (2026-09-11) — proxy de `GET /:sessionName/groups`. */
describe('GET /api/sessions/[sessionName]/groups', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('encaminha para a rota de grupos da API', async () => {
    (callApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: { groups: [], fetchedAt: '2026-09-11T10:00:00.000Z' },
    });
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callApi).toHaveBeenCalledWith(SESSION, '/vendas/groups', {
      query: { refresh: undefined },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('repassa ?refresh=true', async () => {
    (callApi as jest.Mock).mockResolvedValue({ status: 200, body: { groups: [] } });
    const req = createFakeReq({
      method: 'GET',
      query: { sessionName: 'vendas', refresh: 'true' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(callApi).toHaveBeenCalledWith(SESSION, '/vendas/groups', { query: { refresh: 'true' } });
  });

  it('sessão com espaço no nome vai URL-encoded', async () => {
    (callApi as jest.Mock).mockResolvedValue({ status: 200, body: { groups: [] } });
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'whatsapp sites' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callApi).toHaveBeenCalledWith(SESSION, '/whatsapp%20sites/groups', {
      query: { refresh: undefined },
    });
  });

  it('repassa 409 (whatsapp_not_connected) tal como veio', async () => {
    (callApi as jest.Mock).mockResolvedValue({
      status: 409,
      body: { error: 'whatsapp_not_connected' },
    });
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'whatsapp_not_connected' });
  });

  it('sem sessão válida, não chama a API', async () => {
    (requireSession as jest.Mock).mockReturnValue(null);
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callApi).not.toHaveBeenCalled();
  });

  it('método errado: 405, nunca chama a API', async () => {
    const req = createFakeReq({ method: 'POST', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(callApi).not.toHaveBeenCalled();
  });
});
