import handler from '../../../../pages/api/conversations/[conversationId]/stage';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('POST /api/conversations/[conversationId]/stage (pipeline de CRM, Milestone 6, Bloco M6H-5)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('delega a callConversationsApi com method POST e o corpo (stage), devolve a Conversation atualizada', async () => {
    (callConversationsApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: { id: 'conv-1', stage: 'negotiating', stageSetBy: 'human' },
    });
    const req = createFakeReq({
      method: 'POST',
      query: { conversationId: 'conv-1' },
      body: { stage: 'negotiating' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(callConversationsApi).toHaveBeenCalledWith(SESSION, '/conv-1/stage', {
      method: 'POST',
      body: { stage: 'negotiating' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('repassa 400 da API (stage inválido) sem transformar', async () => {
    (callConversationsApi as jest.Mock).mockResolvedValue({
      status: 400,
      body: { error: 'invalid_params' },
    });
    const req = createFakeReq({
      method: 'POST',
      query: { conversationId: 'conv-1' },
      body: { stage: 'valor-invalido' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('repassa 404 da API (conversa inexistente/outro tenant) sem transformar', async () => {
    (callConversationsApi as jest.Mock).mockResolvedValue({
      status: 404,
      body: { error: 'conversation_not_found' },
    });
    const req = createFakeReq({
      method: 'POST',
      query: { conversationId: 'conv-x' },
      body: { stage: 'contacted' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('responde 405 para métodos diferentes de POST', async () => {
    const req = createFakeReq({ method: 'GET', query: { conversationId: 'conv-1' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
