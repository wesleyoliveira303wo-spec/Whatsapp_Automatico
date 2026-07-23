import handler from '../../../../pages/api/ai-interactions/index';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callAiInteractionsApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('GET /api/ai-interactions (Milestone 3, Bloco 6 - D22/D28)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('repassa conversationId/limit da query (conversationId presente filtra por conversa - D13 do Bloco 5)', async () => {
    (callAiInteractionsApi as jest.Mock).mockResolvedValue({ status: 200, body: { interactions: [] } });
    const req = createFakeReq({ method: 'GET', query: { conversationId: 'conv-1', limit: '20' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callAiInteractionsApi).toHaveBeenCalledWith(SESSION, '', {
      query: { conversationId: 'conv-1', limit: '20' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('funciona sem conversationId (lista o tenant inteiro - D13, conversationId opcional)', async () => {
    (callAiInteractionsApi as jest.Mock).mockResolvedValue({ status: 200, body: { interactions: [] } });
    const req = createFakeReq({ method: 'GET', query: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(callAiInteractionsApi).toHaveBeenCalledWith(SESSION, '', {
      query: { conversationId: undefined, limit: undefined },
    });
  });

  it('nao chama a API sem sessao valida', async () => {
    (requireSession as jest.Mock).mockReturnValue(null);
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();

    await handler(req, res);

    expect(callAiInteractionsApi).not.toHaveBeenCalled();
  });

  it('responde 405 para metodos diferentes de GET', async () => {
    const req = createFakeReq({ method: 'POST' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
