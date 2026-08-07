import handler from '../../../../pages/api/sessions/index';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('GET/POST /api/sessions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('responde 401 (via requireSession) e nunca chama callApi quando não há sessão', async () => {
    (requireSession as jest.Mock).mockImplementation((_req, res) => {
      res.status(401).json({ error: 'not_authenticated' });
      return null;
    });
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(callApi).not.toHaveBeenCalled();
  });

  it('GET delega a callApi(session, "") e encaminha status/body', async () => {
    (requireSession as jest.Mock).mockReturnValue(SESSION);
    (callApi as jest.Mock).mockResolvedValue({ status: 200, body: { sessions: [] } });
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();

    await handler(req, res);

    expect(callApi).toHaveBeenCalledWith(SESSION, '');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ sessions: [] });
  });

  it('POST delega a callApi(session, "", { method: "POST", body }) com o corpo da requisição', async () => {
    (requireSession as jest.Mock).mockReturnValue(SESSION);
    (callApi as jest.Mock).mockResolvedValue({ status: 200, body: { sessionName: 'vendas' } });
    const req = createFakeReq({ method: 'POST', body: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callApi).toHaveBeenCalledWith(SESSION, '', {
      method: 'POST',
      body: { sessionName: 'vendas' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('responde 405 para métodos não suportados', async () => {
    (requireSession as jest.Mock).mockReturnValue(SESSION);
    const req = createFakeReq({ method: 'PUT' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(callApi).not.toHaveBeenCalled();
  });
});
