import handler from '../../../../pages/api/contacts/index';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';

jest.mock('../../../../lib/dashboardSession');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

/**
 * Testes do proxy `GET /api/contacts` (Fase L, Bloco L1b) — encaminhamento
 * de query/status/corpo para `apps/api`, mesmo padrão de
 * `pages/api/users/index.test.ts`. Nenhuma regra de negócio reimplementada
 * no BFF.
 */
describe('proxy /api/contacts (Fase L, Bloco L1b)', () => {
  const originalFetch = global.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.API_BASE_URL = 'http://api-de-teste:4000';
    (requireSession as jest.Mock).mockResolvedValue(SESSION);
  });

  afterAll(() => {
    global.fetch = originalFetch;
    process.env.API_BASE_URL = originalApiBaseUrl;
  });

  function mockApi(status: number, body: unknown): void {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ status, text: async () => JSON.stringify(body) }) as unknown as typeof fetch;
  }

  it('sem sessão: não chama a API (requireSession já responde)', async () => {
    (requireSession as jest.Mock).mockResolvedValue(null);
    global.fetch = jest.fn() as unknown as typeof fetch;
    const req = createFakeReq({ method: 'GET', query: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET: repassa limit/cursor/search e devolve a página da API', async () => {
    mockApi(200, { contacts: [{ id: 'contact-1' }], nextCursor: 'contact-1' });
    const req = createFakeReq({
      method: 'GET',
      query: { limit: '10', cursor: 'c0', search: 'maria' },
    });
    const res = createFakeRes();

    await handler(req, res);

    const [url] = (fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe(
      'http://api-de-teste:4000/api/tenants/tenant-1/contacts?limit=10&cursor=c0&search=maria',
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      contacts: [{ id: 'contact-1' }],
      nextCursor: 'contact-1',
    });
  });

  it('GET sem query: não inclui parâmetros ausentes na URL', async () => {
    mockApi(200, { contacts: [] });
    const req = createFakeReq({ method: 'GET', query: {} });
    const res = createFakeRes();

    await handler(req, res);

    const [url] = (fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('http://api-de-teste:4000/api/tenants/tenant-1/contacts');
  });

  it('erro de negócio da API passa intacto (403 sem contact:read)', async () => {
    mockApi(403, { error: 'forbidden' });
    const req = createFakeReq({ method: 'GET', query: {} });
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
