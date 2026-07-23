import handler from '../../../../pages/api/sessions/[sessionName]/remove';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('DELETE /api/sessions/[sessionName]/remove', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('responde 400 quando sessionName está ausente', async () => {
    const req = createFakeReq({ method: 'DELETE', query: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(callApi).not.toHaveBeenCalled();
  });

  it('delega a callApi(session, "/:sessionName/remove", { method: "DELETE" })', async () => {
    (callApi as jest.Mock).mockResolvedValue({ status: 204, body: undefined });
    const req = createFakeReq({ method: 'DELETE', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callApi).toHaveBeenCalledWith(SESSION, '/vendas/remove', { method: 'DELETE' });
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('responde 405 para métodos diferentes de DELETE', async () => {
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(callApi).not.toHaveBeenCalled();
  });
});
