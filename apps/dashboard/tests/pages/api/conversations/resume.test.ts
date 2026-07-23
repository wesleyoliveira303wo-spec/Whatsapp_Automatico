import handler from '../../../../pages/api/conversations/[conversationId]/resume';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('POST /api/conversations/[conversationId]/resume (Milestone 3, Bloco 6 - D22)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('delega a callConversationsApi com method POST no path /resume', async () => {
    (callConversationsApi as jest.Mock).mockResolvedValue({ status: 200, body: { id: 'conv-1', status: 'bot' } });
    const req = createFakeReq({ method: 'POST', query: { conversationId: 'conv-1' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callConversationsApi).toHaveBeenCalledWith(SESSION, '/conv-1/resume', { method: 'POST' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('responde 400 quando conversationId esta ausente', async () => {
    const req = createFakeReq({ method: 'POST', query: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(callConversationsApi).not.toHaveBeenCalled();
  });

  it('responde 405 para metodos diferentes de POST', async () => {
    const req = createFakeReq({ method: 'GET', query: { conversationId: 'conv-1' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
