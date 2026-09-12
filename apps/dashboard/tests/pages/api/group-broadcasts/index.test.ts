import handler from '../../../../pages/api/group-broadcasts/index';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callGroupBroadcastsApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

/**
 * Testes do proxy `GET/POST /api/group-broadcasts` (Disparos em grupos,
 * 2026-09-11) — encaminhamento de query/corpo/status, mesmo padrão de
 * `pages/api/contacts/index.test.ts`. Nenhuma regra de negócio reimplementada
 * no BFF.
 */
describe('proxy /api/group-broadcasts', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockResolvedValue(SESSION);
  });

  it('sem sessão: não chama a API', async () => {
    (requireSession as jest.Mock).mockResolvedValue(null);
    const req = createFakeReq({ method: 'GET', query: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(callGroupBroadcastsApi).not.toHaveBeenCalled();
  });

  it('GET: repassa sessionName e devolve a lista da API', async () => {
    (callGroupBroadcastsApi as jest.Mock).mockResolvedValue({
      status: 200,
      body: { broadcasts: [{ broadcast: { id: 'b1' }, summary: {} }] },
    });
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(callGroupBroadcastsApi).toHaveBeenCalledWith(SESSION, '', {
      query: { sessionName: 'vendas' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('POST: repassa o corpo e devolve broadcast+summary+targets', async () => {
    (callGroupBroadcastsApi as jest.Mock).mockResolvedValue({
      status: 201,
      body: { broadcast: { id: 'b1' }, summary: { total: 1 }, targets: [] },
    });
    const body = { sessionName: 'vendas', name: 'Disparo', messageTemplate: 'Oi', groupJids: ['1@g.us'] };
    const req = createFakeReq({ method: 'POST', query: {}, body });
    const res = createFakeRes();

    await handler(req, res);

    expect(callGroupBroadcastsApi).toHaveBeenCalledWith(SESSION, '', { method: 'POST', body });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('erro de negócio da API passa intacto (403 sem campaign:manage)', async () => {
    (callGroupBroadcastsApi as jest.Mock).mockResolvedValue({
      status: 403,
      body: { error: 'forbidden' },
    });
    const req = createFakeReq({ method: 'POST', query: {}, body: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'forbidden' });
  });

  it('método errado: 405', async () => {
    const req = createFakeReq({ method: 'DELETE', query: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
