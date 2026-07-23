import handler from '../../../../pages/api/sessions/[sessionName]/index';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('GET/DELETE /api/sessions/[sessionName]', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('responde 400 quando sessionName está ausente do query', async () => {
    const req = createFakeReq({ method: 'GET', query: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(callApi).not.toHaveBeenCalled();
  });

  it('GET delega a callApi(session, "/:sessionName") e encaminha status/body', async () => {
    (callApi as jest.Mock).mockResolvedValue({ status: 200, body: { sessionName: 'vendas', generation: 1 } });
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callApi).toHaveBeenCalledWith(SESSION, '/vendas');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ sessionName: 'vendas', generation: 1 });
  });

  it('DELETE delega a callApi(session, "/:sessionName", { method: "DELETE" }) e encaminha só o status (sem body)', async () => {
    (callApi as jest.Mock).mockResolvedValue({ status: 204, body: undefined });
    const req = createFakeReq({ method: 'DELETE', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callApi).toHaveBeenCalledWith(SESSION, '/vendas', { method: 'DELETE' });
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('responde 405 para métodos não suportados', async () => {
    const req = createFakeReq({ method: 'PUT', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
