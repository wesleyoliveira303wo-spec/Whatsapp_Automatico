import handler from '../../../../pages/api/sessions/[sessionName]/history';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('GET /api/sessions/[sessionName]/history', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('delega a callApi(session, "/:sessionName/history") sem query quando ?limit= não é enviado', async () => {
    (callApi as jest.Mock).mockResolvedValue({ status: 200, body: { events: [] } });
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callApi).toHaveBeenCalledWith(SESSION, '/vendas/history', {
      query: { limit: undefined },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('encaminha ?limit= tal como recebido, sem validar/interpretar', async () => {
    (callApi as jest.Mock).mockResolvedValue({ status: 200, body: { events: [] } });
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas', limit: '10' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callApi).toHaveBeenCalledWith(SESSION, '/vendas/history', { query: { limit: '10' } });
  });

  it('responde 405 para métodos diferentes de GET', async () => {
    const req = createFakeReq({ method: 'DELETE', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
