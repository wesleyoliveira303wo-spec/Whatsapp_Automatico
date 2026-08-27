import handler from '../../../../pages/api/sessions/[sessionName]/ai-preferences/index';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callAiProfileApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

/**
 * Testes do proxy das Preferências do Cérebro da IA (v3, Fase 3, 2026-08-26)
 * — mesmo padrão exato de `aiProfile.test.ts` (reaproveita `callAiProfileApi`,
 * mesmo recurso `sessions`).
 */
const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('proxy /api/sessions/[sessionName]/ai-preferences (Cérebro da IA v3, Fase 3)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('responde 400 quando sessionName está ausente', async () => {
    const req = createFakeReq({ method: 'GET', query: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(callAiProfileApi).not.toHaveBeenCalled();
  });

  it('GET: delega a callAiProfileApi(session, "/:sessionName/ai-preferences") e encaminha status/body', async () => {
    (callAiProfileApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: { preferences: null },
    });
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callAiProfileApi).toHaveBeenCalledWith(SESSION, '/vendas/ai-preferences');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ preferences: null });
  });

  it('PUT: encaminha o corpo e devolve o status da API (200)', async () => {
    const body = { autonomyLevel: 'autonomous', maxDiscountPercent: 15 };
    (callAiProfileApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: {
        preferences: {
          tenantId: 'tenant-1',
          sessionName: 'vendas',
          updatedAt: '2026-08-26T00:00:00.000Z',
          autonomyLevel: 'autonomous',
          maxDiscountPercent: 15,
          topicsToAvoid: null,
          escalateAfterAttempts: null,
          customHandoffMessage: null,
        },
      },
    });
    const req = createFakeReq({ method: 'PUT', query: { sessionName: 'vendas' }, body });
    const res = createFakeRes();

    await handler(req, res);

    expect(callAiProfileApi).toHaveBeenCalledWith(SESSION, '/vendas/ai-preferences', {
      method: 'PUT',
      body,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('erros da API passam intactos (403 forbidden)', async () => {
    (callAiProfileApi as jest.Mock).mockResolvedValue({
      status: 403,
      body: { error: 'forbidden' },
    });
    const req = createFakeReq({
      method: 'PUT',
      query: { sessionName: 'vendas' },
      body: { autonomyLevel: 'autonomous' },
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
