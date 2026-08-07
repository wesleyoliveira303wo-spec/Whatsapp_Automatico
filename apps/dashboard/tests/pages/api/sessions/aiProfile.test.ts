import handler from '../../../../pages/api/sessions/[sessionName]/ai-profile/index';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callAiProfileApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

/**
 * Testes do proxy da Base de Conhecimento (Nível 1 — o "Cérebro da IA") por
 * SESSÃO — migrado da rota flat `/api/ai-profile` para
 * `/api/sessions/:sessionName/ai-profile` (M6H-3, 2026-07-25). Mesmo padrão
 * de mock de `qrcode.test.ts` (mocka `requireSession`/`callAiProfileApi`, não
 * exercita cookies reais — a lógica de sessão já é coberta em
 * `dashboardSession.test.ts`).
 */
const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('proxy /api/sessions/[sessionName]/ai-profile (Base de Conhecimento — Nível 1)', () => {
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

  it('GET: delega a callAiProfileApi(session, "/:sessionName/ai-profile") e encaminha status/body', async () => {
    (callAiProfileApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: {
        profile: {
          tenantId: 'tenant-1',
          sessionName: 'vendas',
          content: 'Salão da Maria.',
          updatedAt: '2026-07-25T10:00:00.000Z',
        },
      },
    });
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callAiProfileApi).toHaveBeenCalledWith(SESSION, '/vendas/ai-profile');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      profile: {
        tenantId: 'tenant-1',
        sessionName: 'vendas',
        content: 'Salão da Maria.',
        updatedAt: '2026-07-25T10:00:00.000Z',
      },
    });
  });

  it('PUT: encaminha o corpo (content) e devolve o status da API (200)', async () => {
    (callAiProfileApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: {
        profile: {
          tenantId: 'tenant-1',
          sessionName: 'vendas',
          content: 'Barbearia do João.',
          updatedAt: '2026-07-25T11:00:00.000Z',
        },
      },
    });
    const req = createFakeReq({
      method: 'PUT',
      query: { sessionName: 'vendas' },
      body: { content: 'Barbearia do João.' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(callAiProfileApi).toHaveBeenCalledWith(SESSION, '/vendas/ai-profile', {
      method: 'PUT',
      body: { content: 'Barbearia do João.' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('F1.8: PUT encaminha campos de horário de atendimento no corpo (200)', async () => {
    const fullBody = {
      content: 'Salão da Maria.',
      offHoursEnabled: true,
      workingHoursStart: '09:00',
      workingHoursEnd: '18:00',
      workingDays: 62,
      timezone: 'America/Sao_Paulo',
    };
    (callAiProfileApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: {
        profile: {
          tenantId: 'tenant-1',
          sessionName: 'vendas',
          ...fullBody,
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      },
    });
    const req = createFakeReq({ method: 'PUT', query: { sessionName: 'vendas' }, body: fullBody });
    const res = createFakeRes();

    await handler(req, res);

    expect(callAiProfileApi).toHaveBeenCalledWith(SESSION, '/vendas/ai-profile', {
      method: 'PUT',
      body: fullBody,
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
