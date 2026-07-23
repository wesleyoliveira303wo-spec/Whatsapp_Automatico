import handler from '../../../../pages/api/sessions/stream';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';
import { runSsePoller } from '../../../../lib/sse';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');
jest.mock('../../../../lib/sse');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('GET /api/sessions/stream (SSE, lista)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('responde 401 e nunca inicia o poller quando não há sessão', async () => {
    (requireSession as jest.Mock).mockImplementation((_req, res) => {
      res.status(401).json({ error: 'not_authenticated' });
      return null;
    });
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();

    await handler(req, res);

    expect(runSsePoller).not.toHaveBeenCalled();
  });

  it('responde 405 para métodos diferentes de GET, sem iniciar o poller', async () => {
    const req = createFakeReq({ method: 'POST' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(runSsePoller).not.toHaveBeenCalled();
  });

  it('inicia runSsePoller com uma função poll() que delega a callApi(session, "")', async () => {
    (callApi as jest.Mock).mockResolvedValue({ status: 200, body: { sessions: [] } });
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();

    await handler(req, res);

    expect(runSsePoller).toHaveBeenCalledTimes(1);
    const [, , poll] = (runSsePoller as jest.Mock).mock.calls[0];
    await poll();
    expect(callApi).toHaveBeenCalledWith(SESSION, '');
  });
});
