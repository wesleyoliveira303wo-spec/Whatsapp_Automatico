import handler from '../../../../pages/api/analytics/ai-usage';
import { createFakeReq, createFakeRes } from '../../../testDoubles';

/**
 * Rota flat `/api/analytics/ai-usage` DESATIVADA — migrada para
 * `/api/sessions/:sessionName/analytics/ai-usage` (M6H-4, 2026-07-26, ver
 * `tests/pages/api/sessions/analytics.test.ts`). Este teste só garante que a
 * rota antiga devolve um aviso claro (410) em vez de comportamento
 * inesperado — o arquivo não pode ser apagado neste ambiente. Mesmo padrão
 * já usado para `pages/api/ai-profile/index.ts` (M6H-3).
 */
describe('proxy /api/analytics/ai-usage (DESATIVADO desde M6H-4)', () => {
  it('devolve 410 route_moved para qualquer método', () => {
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();

    handler(req, res);

    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'route_moved' }));
  });
});
