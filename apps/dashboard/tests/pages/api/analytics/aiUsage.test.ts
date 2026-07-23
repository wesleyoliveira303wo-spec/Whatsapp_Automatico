import handler from '../../../../pages/api/analytics/ai-usage';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callAnalyticsApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('GET /api/analytics/ai-usage (Milestone 4, Bloco M4D)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('delega a callAnalyticsApi("/ai-usage") repassando from/to/granularity', async () => {
    (callAnalyticsApi as jest.Mock).mockResolvedValue({ status: 200, body: { points: [] } });
    const req = createFakeReq({ method: 'GET', query: { from: '2026-07-01', to: '2026-07-10', granularity: 'day' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callAnalyticsApi).toHaveBeenCalledWith(SESSION, '/ai-usage', {
      query: { from: '2026-07-01', to: '2026-07-10', granularity: 'day' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('repassa status de erro da API sem transformar (ex.: 400 de faixa invalida)', async () => {
    (callAnalyticsApi as jest.Mock).mockResolvedValue({ status: 400, body: { error: 'invalid_analytics_range' } });
    const req = createFakeReq({ method: 'GET', query: { from: '2026-07-10', to: '2026-07-01' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('nao chama a API sem sessao valida', async () => {
    (requireSession as jest.Mock).mockReturnValue(null);
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();

    await handler(req, res);

    expect(callAnalyticsApi).not.toHaveBeenCalled();
  });

  it('responde 405 para metodos diferentes de GET', async () => {
    const req = createFakeReq({ method: 'POST' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
