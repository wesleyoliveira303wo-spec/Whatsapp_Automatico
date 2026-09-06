import listHandler from '../../../../pages/api/platform/tenants/index';
import detailHandler from '../../../../pages/api/platform/tenants/[tenantId]';
import { setPlatformSessionCookie, type PlatformSession } from '../../../../lib/platformSession';
import { createFakeReq, createFakeRes, setCookieHeaders } from '../../../testDoubles';

const SESSION: PlatformSession = {
  token: 'cracha-de-plataforma',
  user: { id: 'admin-1', email: 'dono@francis.app', name: 'Dono' },
};

function loggedInCookies(): Record<string, string> {
  const res = createFakeRes();
  setPlatformSessionCookie(res, SESSION);
  const cookies: Record<string, string> = {};
  for (const header of setCookieHeaders(res)) {
    const [pair] = header.split(';');
    const index = pair.indexOf('=');
    cookies[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return cookies;
}

function mockApi(status: number, body: unknown): void {
  (fetch as jest.Mock).mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  });
}

describe('BFF /api/platform/tenants', () => {
  const originals = {
    apiBaseUrl: process.env.API_BASE_URL,
    secret: process.env.PLATFORM_DASHBOARD_SESSION_SECRET,
  };

  beforeEach(() => {
    process.env.API_BASE_URL = 'http://api-de-teste:4000';
    process.env.PLATFORM_DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 9).toString('base64');
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env.API_BASE_URL = originals.apiBaseUrl;
    process.env.PLATFORM_DASHBOARD_SESSION_SECRET = originals.secret;
  });

  describe('GET /tenants', () => {
    it('sem sessão de plataforma → 401, sem chamar a API', async () => {
      const res = createFakeRes();

      await listHandler(createFakeReq({ method: 'GET' }), res);

      expect(res._status).toBe(401);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('recusa método diferente de GET', async () => {
      const res = createFakeRes();

      await listHandler(createFakeReq({ method: 'POST', cookies: loggedInCookies() }), res);

      expect(res._status).toBe(405);
    });

    it('com sessão → repassa GET /api/platform/tenants e devolve o JSON', async () => {
      mockApi(200, { tenants: [{ id: 't1', name: 'Cliente', signals: [] }] });
      const res = createFakeRes();

      await listHandler(createFakeReq({ method: 'GET', cookies: loggedInCookies() }), res);

      const [url] = (fetch as jest.Mock).mock.calls[0];
      expect(String(url)).toBe('http://api-de-teste:4000/api/platform/tenants');
      expect(res._status).toBe(200);
      expect(res._json).toEqual({ tenants: [{ id: 't1', name: 'Cliente', signals: [] }] });
    });

    it('API recusando o crachá → 401 e cookie descartado', async () => {
      mockApi(401, { error: 'invalid_platform_session' });
      const res = createFakeRes();

      await listHandler(createFakeReq({ method: 'GET', cookies: loggedInCookies() }), res);

      expect(res._status).toBe(401);
      expect(setCookieHeaders(res).join('; ')).toContain('Max-Age=0');
    });
  });

  describe('GET /tenants/:tenantId', () => {
    it('404 da API é repassado como 404 (não é falha de infraestrutura)', async () => {
      mockApi(404, { error: 'tenant_not_found' });
      const res = createFakeRes();

      await detailHandler(
        createFakeReq({ method: 'GET', cookies: loggedInCookies(), query: { tenantId: 'ghost' } }),
        res,
      );

      expect(res._status).toBe(404);
      expect(res._json).toMatchObject({ error: 'tenant_not_found' });
    });

    it('com sessão → repassa o id no caminho', async () => {
      mockApi(200, { tenant: { id: 't1', name: 'Cliente', signals: [], sessions: [] } });
      const res = createFakeRes();

      await detailHandler(
        createFakeReq({ method: 'GET', cookies: loggedInCookies(), query: { tenantId: 't1' } }),
        res,
      );

      const [url] = (fetch as jest.Mock).mock.calls[0];
      expect(String(url)).toBe('http://api-de-teste:4000/api/platform/tenants/t1');
      expect(res._status).toBe(200);
    });
  });
});
