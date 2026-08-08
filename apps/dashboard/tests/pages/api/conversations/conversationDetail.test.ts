import handler from '../../../../pages/api/conversations/[conversationId]/index';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('GET /api/conversations/[conversationId] (Fase 1, Bloco F1.10)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('delega a callConversationsApi (GET) e devolve a Conversation', async () => {
    (callConversationsApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: { id: 'conv-1', tenantId: 'tenant-1', status: 'bot' },
    });
    const req = createFakeReq({ method: 'GET', query: { conversationId: 'conv-1' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callConversationsApi).toHaveBeenCalledWith(SESSION, '/conv-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: 'conv-1', tenantId: 'tenant-1', status: 'bot' });
  });

  it('repassa 404 da API (conversa inexistente/outro tenant) sem transformar', async () => {
    (callConversationsApi as jest.Mock).mockResolvedValue({
      status: 404,
      body: { error: 'conversation_not_found' },
    });
    const req = createFakeReq({ method: 'GET', query: { conversationId: 'conv-x' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('responde 405 para metodos diferentes de GET', async () => {
    const req = createFakeReq({ method: 'POST', query: { conversationId: 'conv-1' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('sem sessao valida, delega a requireSession e nao chama a API', async () => {
    (requireSession as jest.Mock).mockReturnValue(null);
    const req = createFakeReq({ method: 'GET', query: { conversationId: 'conv-1' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callConversationsApi).not.toHaveBeenCalled();
  });
});
