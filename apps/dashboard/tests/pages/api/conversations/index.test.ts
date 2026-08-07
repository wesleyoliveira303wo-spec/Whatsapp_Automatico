import handler from '../../../../pages/api/conversations/index';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('GET /api/conversations (Milestone 3, Bloco 6 - D22)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('delega a callConversationsApi(session, "") repassando status/limit/cursor da query', async () => {
    (callConversationsApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: { conversations: [] },
    });
    const req = createFakeReq({
      method: 'GET',
      query: { status: 'human', limit: '10', cursor: 'abc' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(callConversationsApi).toHaveBeenCalledWith(SESSION, '', {
      query: { status: 'human', limit: '10', cursor: 'abc' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('repassa o status HTTP de erro da API sem transformar (mesmo padrao proxy-fino das rotas de sessions)', async () => {
    (callConversationsApi as jest.Mock).mockResolvedValue({
      status: 404,
      body: { error: 'tenant_not_found' },
    });
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('nao chama a API sem sessao valida (requireSession ja respondeu 401)', async () => {
    (requireSession as jest.Mock).mockReturnValue(null);
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();

    await handler(req, res);

    expect(callConversationsApi).not.toHaveBeenCalled();
  });

  it('responde 405 para metodos diferentes de GET', async () => {
    const req = createFakeReq({ method: 'POST' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
