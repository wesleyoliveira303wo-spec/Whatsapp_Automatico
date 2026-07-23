import handler from '../../../../pages/api/sessions/[sessionName]/qrcode';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('GET /api/sessions/[sessionName]/qrcode', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('responde 400 quando sessionName está ausente', async () => {
    const req = createFakeReq({ method: 'GET', query: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(callApi).not.toHaveBeenCalled();
  });

  it('delega a callApi(session, "/:sessionName/qrcode") e encaminha status/body', async () => {
    (callApi as jest.Mock).mockResolvedValue({ status: 200, body: { qrCode: 'base64...' } });
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callApi).toHaveBeenCalledWith(SESSION, '/vendas/qrcode');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ qrCode: 'base64...' });
  });

  it('responde 405 para métodos diferentes de GET', async () => {
    const req = createFakeReq({ method: 'POST', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
