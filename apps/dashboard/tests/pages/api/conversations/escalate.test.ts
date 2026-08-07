import handler from '../../../../pages/api/conversations/[conversationId]/escalate';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('POST /api/conversations/[conversationId]/escalate (Milestone 3, Bloco 6 - D22)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('delega a callConversationsApi com method POST e devolve a Conversation atualizada', async () => {
    (callConversationsApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: { id: 'conv-1', status: 'human' },
    });
    const req = createFakeReq({ method: 'POST', query: { conversationId: 'conv-1' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callConversationsApi).toHaveBeenCalledWith(SESSION, '/conv-1/escalate', {
      method: 'POST',
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('repassa 404 da API (conversa inexistente/outro tenant) sem transformar', async () => {
    (callConversationsApi as jest.Mock).mockResolvedValue({
      status: 404,
      body: { error: 'conversation_not_found' },
    });
    const req = createFakeReq({ method: 'POST', query: { conversationId: 'conv-x' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('responde 405 para metodos diferentes de POST', async () => {
    const req = createFakeReq({ method: 'GET', query: { conversationId: 'conv-1' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
