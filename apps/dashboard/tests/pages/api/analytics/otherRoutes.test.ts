import messagesHandler from '../../../../pages/api/analytics/messages';
import conversationsHandler from '../../../../pages/api/analytics/conversations';
import sessionStabilityHandler from '../../../../pages/api/analytics/session-stability';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callAnalyticsApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };
const QUERY = { from: '2026-07-01', to: '2026-07-10' };

describe('Rotas BFF de analytics restantes (Milestone 4, Bloco M4D)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
    (callAnalyticsApi as jest.Mock).mockResolvedValue({ status: 200, body: {} });
  });

  it('/api/analytics/messages delega ao path /messages', async () => {
    const res = createFakeRes();
    await messagesHandler(createFakeReq({ method: 'GET', query: QUERY }), res);
    expect(callAnalyticsApi).toHaveBeenCalledWith(SESSION, '/messages', {
      query: { from: '2026-07-01', to: '2026-07-10', granularity: undefined },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('/api/analytics/conversations delega ao path /conversations', async () => {
    const res = createFakeRes();
    await conversationsHandler(createFakeReq({ method: 'GET', query: QUERY }), res);
    expect(callAnalyticsApi).toHaveBeenCalledWith(SESSION, '/conversations', {
      query: { from: '2026-07-01', to: '2026-07-10', granularity: undefined },
    });
  });

  it('/api/analytics/session-stability delega ao path /session-stability', async () => {
    const res = createFakeRes();
    await sessionStabilityHandler(createFakeReq({ method: 'GET', query: QUERY }), res);
    expect(callAnalyticsApi).toHaveBeenCalledWith(SESSION, '/session-stability', {
      query: { from: '2026-07-01', to: '2026-07-10', granularity: undefined },
    });
  });

  it('todas respondem 405 para POST', async () => {
    for (const handler of [messagesHandler, conversationsHandler, sessionStabilityHandler]) {
      const res = createFakeRes();
      await handler(createFakeReq({ method: 'POST' }), res);
      expect(res.status).toHaveBeenCalledWith(405);
    }
    expect(callAnalyticsApi).not.toHaveBeenCalled();
  });
});
