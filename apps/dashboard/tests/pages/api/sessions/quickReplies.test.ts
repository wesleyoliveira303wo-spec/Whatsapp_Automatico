import handler from '../../../../pages/api/sessions/[sessionName]/quick-replies/index';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callQuickRepliesApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

/**
 * Testes do proxy das Respostas Rápidas por SESSÃO (Fase 1, Bloco F1.9) —
 * `GET /` (listar) e `POST /` (criar). Mesmo padrão de mock de
 * `aiProfile.test.ts` (mocka `requireSession`/`callQuickRepliesApi`, não
 * exercita cookies reais).
 */
const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('proxy /api/sessions/[sessionName]/quick-replies (Fase 1, Bloco F1.9)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('responde 400 quando sessionName está ausente', async () => {
    const req = createFakeReq({ method: 'GET', query: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(callQuickRepliesApi).not.toHaveBeenCalled();
  });

  it('GET: delega a callQuickRepliesApi(session, "/:sessionName/quick-replies") e encaminha status/body', async () => {
    (callQuickRepliesApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: {
        quickReplies: [
          {
            id: 'qr-1',
            tenantId: 'tenant-1',
            sessionName: 'vendas',
            content: 'Bom dia!',
            createdAt: '2026-08-05T00:00:00.000Z',
            updatedAt: '2026-08-05T00:00:00.000Z',
          },
        ],
      },
    });
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callQuickRepliesApi).toHaveBeenCalledWith(SESSION, '/vendas/quick-replies');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      quickReplies: [
        {
          id: 'qr-1',
          tenantId: 'tenant-1',
          sessionName: 'vendas',
          content: 'Bom dia!',
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
        },
      ],
    });
  });

  it('POST: encaminha o corpo (content) e devolve o status da API (201)', async () => {
    (callQuickRepliesApi as jest.Mock).mockResolvedValue({
      status: 201,
      body: {
        quickReply: {
          id: 'qr-1',
          tenantId: 'tenant-1',
          sessionName: 'vendas',
          content: 'Bom dia!',
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
        },
      },
    });
    const req = createFakeReq({
      method: 'POST',
      query: { sessionName: 'vendas' },
      body: { content: 'Bom dia!' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(callQuickRepliesApi).toHaveBeenCalledWith(SESSION, '/vendas/quick-replies', {
      method: 'POST',
      body: { content: 'Bom dia!' },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('erros da API passam intactos (403 forbidden)', async () => {
    (callQuickRepliesApi as jest.Mock).mockResolvedValue({
      status: 403,
      body: { error: 'forbidden' },
    });
    const req = createFakeReq({
      method: 'POST',
      query: { sessionName: 'vendas' },
      body: { content: 'x' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'forbidden' });
  });

  it('método errado: 405', async () => {
    const req = createFakeReq({ method: 'DELETE', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
