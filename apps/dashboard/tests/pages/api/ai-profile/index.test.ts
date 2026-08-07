import handler from '../../../../pages/api/ai-profile/index';
import { createFakeReq, createFakeRes } from '../../../testDoubles';

/**
 * Rota flat `/api/ai-profile` DESATIVADA — migrada para
 * `/api/sessions/:sessionName/ai-profile` (M6H-3, 2026-07-25, ver
 * `tests/pages/api/sessions/aiProfile.test.ts`). Este teste só garante que a
 * rota antiga devolve um aviso claro (410) em vez de comportamento
 * inesperado — o arquivo não pode ser apagado neste ambiente.
 */
describe('proxy /api/ai-profile (DESATIVADO desde M6H-3)', () => {
  it('devolve 410 route_moved para qualquer método', () => {
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();

    handler(req, res);

    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'route_moved' }));
  });
});
