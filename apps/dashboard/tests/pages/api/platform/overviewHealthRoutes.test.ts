import overviewHandler from '../../../../pages/api/platform/overview';
import healthHandler from '../../../../pages/api/platform/health';
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
    text: async () => JSON.stringify(body),
  });
}

describe('BFF /api/platform/{overview,health}', () => {
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

  it('overview: sem sessão → 401, sem chamar a API', async () => {
    const res = createFakeRes();
    await overviewHandler(createFakeReq({ method: 'GET' }), res);
    expect(res._status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('overview: com sessão → repassa GET /api/platform/overview', async () => {
    mockApi(200, { actionQueue: [], kpis: { tenants: { total: 21 } } });
    const res = createFakeRes();

    await overviewHandler(createFakeReq({ method: 'GET', cookies: loggedInCookies() }), res);

    expect(String((fetch as jest.Mock).mock.calls[0][0])).toBe(
      'http://api-de-teste:4000/api/platform/overview',
    );
    expect(res._status).toBe(200);
    expect(res._json).toMatchObject({ kpis: { tenants: { total: 21 } } });
  });

  it('health: com sessão → repassa GET /api/platform/health', async () => {
    mockApi(200, { infra: null, aiFailures30d: { total: 0, providerError: 0, rate: null } });
    const res = createFakeRes();

    await healthHandler(createFakeReq({ method: 'GET', cookies: loggedInCookies() }), res);

    expect(String((fetch as jest.Mock).mock.calls[0][0])).toBe(
      'http://api-de-teste:4000/api/platform/health',
    );
    expect(res._status).toBe(200);
    expect(res._json).toMatchObject({ infra: null });
  });

  it('health: API recusando o crachá → 401 e cookie descartado', async () => {
    mockApi(401, { error: 'invalid_platform_session' });
    const res = createFakeRes();

    await healthHandler(createFakeReq({ method: 'GET', cookies: loggedInCookies() }), res);

    expect(res._status).toBe(401);
    expect(setCookieHeaders(res).join('; ')).toContain('Max-Age=0');
  });

  it('overview: método não-GET → 405', async () => {
    const res = createFakeRes();
    await overviewHandler(createFakeReq({ method: 'POST', cookies: loggedInCookies() }), res);
    expect(res._status).toBe(405);
  });
});
