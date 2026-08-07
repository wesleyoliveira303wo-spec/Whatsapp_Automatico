import messagesHandler from '../../../../pages/api/analytics/messages';
import conversationsHandler from '../../../../pages/api/analytics/conversations';
import sessionStabilityHandler from '../../../../pages/api/analytics/session-stability';
import { createFakeReq, createFakeRes } from '../../../testDoubles';

/**
 * Rotas flat `/api/analytics/{messages,conversations,session-stability}`
 * DESATIVADAS — migradas para `/api/sessions/:sessionName/analytics/...`
 * (M6H-4, 2026-07-26, ver `tests/pages/api/sessions/analytics.test.ts`).
 * Mesmo padrão de `aiUsage.test.ts` deste bloco.
 */
describe('Rotas flat de analytics restantes (DESATIVADAS desde M6H-4)', () => {
  it('todas devolvem 410 route_moved', () => {
    for (const handler of [messagesHandler, conversationsHandler, sessionStabilityHandler]) {
      const req = createFakeReq({ method: 'GET' });
      const res = createFakeRes();

      handler(req, res);

      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'route_moved' }));
    }
  });
});
