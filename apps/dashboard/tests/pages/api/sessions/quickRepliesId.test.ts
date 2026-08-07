import handler from '../../../../pages/api/sessions/[sessionName]/quick-replies/[id]';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callQuickRepliesApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

/**
 * Testes do proxy de UMA Resposta Rápida (Fase 1, Bloco F1.9) —
 * `PUT /:id` (editar) e `DELETE /:id` (remover, sem corpo — `res.end()`).
 */
const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('proxy /api/sessions/[sessionName]/quick-replies/[id] (Fase 1, Bloco F1.9)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('responde 400 quando sessionName está ausente', async () => {
    const req = createFakeReq({ method: 'PUT', query: { id: 'qr-1' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(callQuickRepliesApi).not.toHaveBeenCalled();
  });

  it('responde 400 quando id está ausente', async () => {
    const req = createFakeReq({ method: 'PUT', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(callQuickRepliesApi).not.toHaveBeenCalled();
  });

  it('PUT: encaminha o corpo (content) e devolve o status/body da API (200)', async () => {
    (callQuickRepliesApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: {
        quickReply: {
          id: 'qr-1',
          tenantId: 'tenant-1',
          sessionName: 'vendas',
          content: 'Texto novo',
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T01:00:00.000Z',
        },
      },
    });
    const req = createFakeReq({
      method: 'PUT',
      query: { sessionName: 'vendas', id: 'qr-1' },
      body: { content: 'Texto novo' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(callQuickRepliesApi).toHaveBeenCalledWith(SESSION, '/vendas/quick-replies/qr-1', {
      method: 'PUT',
      body: { content: 'Texto novo' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('DELETE: encaminha e responde só com status, sem corpo (204, via .end())', async () => {
    (callQuickRepliesApi as jest.Mock).mockResolvedValue({ status: 204, body: undefined });
    const req = createFakeReq({ method: 'DELETE', query: { sessionName: 'vendas', id: 'qr-1' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callQuickRepliesApi).toHaveBeenCalledWith(SESSION, '/vendas/quick-replies/qr-1', {
      method: 'DELETE',
    });
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('erros da API passam intactos no PUT (404 quick_reply_not_found)', async () => {
    (callQuickRepliesApi as jest.Mock).mockResolvedValue({
      status: 404,
      body: { error: 'quick_reply_not_found' },
    });
    const req = createFakeReq({
      method: 'PUT',
      query: { sessionName: 'vendas', id: 'id-inexistente' },
      body: { content: 'x' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'quick_reply_not_found' });
  });

  it('método errado: 405', async () => {
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas', id: 'qr-1' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
