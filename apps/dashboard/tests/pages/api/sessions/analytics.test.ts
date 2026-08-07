import aiUsageHandler from '../../../../pages/api/sessions/[sessionName]/analytics/ai-usage';
import messagesHandler from '../../../../pages/api/sessions/[sessionName]/analytics/messages';
import conversationsHandler from '../../../../pages/api/sessions/[sessionName]/analytics/conversations';
import sessionStabilityHandler from '../../../../pages/api/sessions/[sessionName]/analytics/session-stability';
import pipelineHandler from '../../../../pages/api/sessions/[sessionName]/analytics/pipeline';
import escalationRateHandler from '../../../../pages/api/sessions/[sessionName]/analytics/escalation-rate';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callAnalyticsApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

/**
 * Testes das rotas BFF de Analytics ANINHADAS por sessão — migradas das
 * rotas flat `pages/api/analytics/*` (M4D) para
 * `pages/api/sessions/:sessionName/analytics/*` (M6H-4, 2026-07-26). Mesmo
 * padrão de mock de `tests/pages/api/sessions/aiProfile.test.ts` (M6H-3):
 * mocka `requireSession`/`callAnalyticsApi`, sem exercitar cookies reais.
 */
const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };
const QUERY = { sessionName: 'vendas', from: '2026-07-01', to: '2026-07-10' };

describe('proxy /api/sessions/[sessionName]/analytics/* (Milestone 6, Bloco M6H-4)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
    (callAnalyticsApi as jest.Mock).mockResolvedValue({ status: 200, body: {} });
  });

  it('ai-usage: responde 400 quando sessionName está ausente', async () => {
    const req = createFakeReq({ method: 'GET', query: { from: '2026-07-01', to: '2026-07-10' } });
    const res = createFakeRes();

    await aiUsageHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(callAnalyticsApi).not.toHaveBeenCalled();
  });

  it('ai-usage: delega a callAnalyticsApi(session, "/:sessionName/analytics/ai-usage") repassando from/to/granularity', async () => {
    const req = createFakeReq({ method: 'GET', query: { ...QUERY, granularity: 'day' } });
    const res = createFakeRes();

    await aiUsageHandler(req, res);

    expect(callAnalyticsApi).toHaveBeenCalledWith(SESSION, '/vendas/analytics/ai-usage', {
      query: { from: '2026-07-01', to: '2026-07-10', granularity: 'day' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('ai-usage: repassa status de erro da API sem transformar (ex.: 400 de faixa invalida)', async () => {
    (callAnalyticsApi as jest.Mock).mockResolvedValue({
      status: 400,
      body: { error: 'invalid_analytics_range' },
    });
    const req = createFakeReq({
      method: 'GET',
      query: { sessionName: 'vendas', from: '2026-07-10', to: '2026-07-01' },
    });
    const res = createFakeRes();

    await aiUsageHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('ai-usage: nao chama a API sem sessao valida', async () => {
    (requireSession as jest.Mock).mockReturnValue(null);
    const req = createFakeReq({ method: 'GET', query: QUERY });
    const res = createFakeRes();

    await aiUsageHandler(req, res);

    expect(callAnalyticsApi).not.toHaveBeenCalled();
  });

  it('ai-usage: responde 405 para metodos diferentes de GET', async () => {
    const req = createFakeReq({ method: 'POST', query: QUERY });
    const res = createFakeRes();

    await aiUsageHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('messages: delega ao path /:sessionName/analytics/messages', async () => {
    const req = createFakeReq({ method: 'GET', query: QUERY });
    const res = createFakeRes();

    await messagesHandler(req, res);

    expect(callAnalyticsApi).toHaveBeenCalledWith(SESSION, '/vendas/analytics/messages', {
      query: { from: '2026-07-01', to: '2026-07-10', granularity: undefined },
    });
  });

  it('conversations: delega ao path /:sessionName/analytics/conversations', async () => {
    const req = createFakeReq({ method: 'GET', query: QUERY });
    const res = createFakeRes();

    await conversationsHandler(req, res);

    expect(callAnalyticsApi).toHaveBeenCalledWith(SESSION, '/vendas/analytics/conversations', {
      query: { from: '2026-07-01', to: '2026-07-10', granularity: undefined },
    });
  });

  it('session-stability: delega ao path /:sessionName/analytics/session-stability', async () => {
    const req = createFakeReq({ method: 'GET', query: QUERY });
    const res = createFakeRes();

    await sessionStabilityHandler(req, res);

    expect(callAnalyticsApi).toHaveBeenCalledWith(SESSION, '/vendas/analytics/session-stability', {
      query: { from: '2026-07-01', to: '2026-07-10', granularity: undefined },
    });
  });

  // Fase 1, Bloco F1.6 — Analytics de NEGOCIO.
  it('pipeline: delega ao path /:sessionName/analytics/pipeline SEM repassar from/to/granularity (retrato atual, sem faixa de tempo)', async () => {
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await pipelineHandler(req, res);

    expect(callAnalyticsApi).toHaveBeenCalledWith(SESSION, '/vendas/analytics/pipeline');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('pipeline: responde 400 quando sessionName está ausente', async () => {
    const req = createFakeReq({ method: 'GET', query: {} });
    const res = createFakeRes();

    await pipelineHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(callAnalyticsApi).not.toHaveBeenCalled();
  });

  it('pipeline: responde 405 para POST', async () => {
    const req = createFakeReq({ method: 'POST', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await pipelineHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('escalation-rate: delega ao path /:sessionName/analytics/escalation-rate', async () => {
    const req = createFakeReq({ method: 'GET', query: QUERY });
    const res = createFakeRes();

    await escalationRateHandler(req, res);

    expect(callAnalyticsApi).toHaveBeenCalledWith(SESSION, '/vendas/analytics/escalation-rate', {
      query: { from: '2026-07-01', to: '2026-07-10', granularity: undefined },
    });
  });

  it('todas respondem 405 para POST', async () => {
    for (const handler of [
      messagesHandler,
      conversationsHandler,
      sessionStabilityHandler,
      escalationRateHandler,
    ]) {
      const res = createFakeRes();
      await handler(createFakeReq({ method: 'POST', query: QUERY }), res);
      expect(res.status).toHaveBeenCalledWith(405);
    }
  });

  it('todas respondem 400 quando sessionName está ausente', async () => {
    for (const handler of [
      messagesHandler,
      conversationsHandler,
      sessionStabilityHandler,
      escalationRateHandler,
    ]) {
      const res = createFakeRes();
      await handler(
        createFakeReq({ method: 'GET', query: { from: '2026-07-01', to: '2026-07-10' } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });
});
