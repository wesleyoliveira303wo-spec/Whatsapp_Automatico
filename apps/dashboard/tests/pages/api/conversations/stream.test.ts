import handler from '../../../../pages/api/conversations/stream';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';
import { runSsePoller } from '../../../../lib/sse';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');
jest.mock('../../../../lib/sse');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('GET /api/conversations/stream (Milestone 3, Bloco 6 - D23)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('inicia o poller SSE com um poll() que delega a callConversationsApi com o filtro congelado da conexao', async () => {
    const req = createFakeReq({ method: 'GET', query: { status: 'bot' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(runSsePoller).toHaveBeenCalledTimes(1);
    const poll = (runSsePoller as jest.Mock).mock.calls[0][2] as () => Promise<unknown>;
    (callConversationsApi as jest.Mock).mockResolvedValue({ status: 200, body: { conversations: [] } });
    await poll();
    expect(callConversationsApi).toHaveBeenCalledWith(SESSION, '', { query: { status: 'bot', limit: undefined } });
  });

  it('nao inicia o poller sem sessao valida', async () => {
    (requireSession as jest.Mock).mockReturnValue(null);
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();

    await handler(req, res);

    expect(runSsePoller).not.toHaveBeenCalled();
  });

  it('responde 405 para metodos diferentes de GET, sem iniciar poller', async () => {
    const req = createFakeReq({ method: 'POST' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(runSsePoller).not.toHaveBeenCalled();
  });
});
