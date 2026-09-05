import handler from '../../../../pages/api/ai-interactions/unanswered';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callAiInteractionsApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

/** Bloco B3 (issue #14) — proxy das perguntas que a IA não soube responder. */
describe('GET /api/ai-interactions/unanswered', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('repassa sessionName/limit para a rota /unanswered da API', async () => {
    (callAiInteractionsApi as jest.Mock).mockResolvedValue({ status: 200, body: { questions: [] } });
    const req = createFakeReq({
      method: 'GET',
      query: { sessionName: 'whatsapp-sites', limit: '10' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(callAiInteractionsApi).toHaveBeenCalledWith(SESSION, '/unanswered', {
      query: { sessionName: 'whatsapp-sites', limit: '10' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sem sessionName: repassa undefined e deixa a API recusar (nunca inventa uma sessão)', async () => {
    (callAiInteractionsApi as jest.Mock).mockResolvedValue({
      status: 400,
      body: { error: 'validation_error' },
    });
    const req = createFakeReq({ method: 'GET', query: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(callAiInteractionsApi).toHaveBeenCalledWith(SESSION, '/unanswered', {
      query: { sessionName: undefined, limit: undefined },
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('não chama a API sem sessão válida', async () => {
    (requireSession as jest.Mock).mockReturnValue(null);
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'whatsapp-sites' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callAiInteractionsApi).not.toHaveBeenCalled();
  });

  it('responde 405 para métodos diferentes de GET', async () => {
    const req = createFakeReq({ method: 'POST', query: { sessionName: 'whatsapp-sites' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
