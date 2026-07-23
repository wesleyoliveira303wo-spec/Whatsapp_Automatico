import handler from '../../../../pages/api/sessions/[sessionName]/stream';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';
import { runSsePoller } from '../../../../lib/sse';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');
jest.mock('../../../../lib/sse');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('GET /api/sessions/[sessionName]/stream (SSE, detalhe)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('responde 400 e nunca inicia o poller quando sessionName está ausente', async () => {
    const req = createFakeReq({ method: 'GET', query: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(runSsePoller).not.toHaveBeenCalled();
  });

  it('responde 405 para métodos diferentes de GET', async () => {
    const req = createFakeReq({ method: 'DELETE', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(runSsePoller).not.toHaveBeenCalled();
  });

  it('inicia runSsePoller com uma função poll() que delega a callApi(session, "/:sessionName")', async () => {
    (callApi as jest.Mock).mockResolvedValue({ status: 200, body: { sessionName: 'vendas', generation: 2 } });
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(runSsePoller).toHaveBeenCalledTimes(1);
    const [, , poll] = (runSsePoller as jest.Mock).mock.calls[0];
    await poll();
    expect(callApi).toHaveBeenCalledWith(SESSION, '/vendas');
  });
});
