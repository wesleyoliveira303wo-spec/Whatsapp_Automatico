import searchHandler from '../../../../pages/api/platform/search';
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
    const i = pair.indexOf('=');
    cookies[pair.slice(0, i)] = pair.slice(i + 1);
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

describe('BFF /api/platform/search (Fase 6)', () => {
  beforeEach(() => {
    process.env.API_BASE_URL = 'http://api-de-teste:4000';
    process.env.PLATFORM_DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 9).toString('base64');
    global.fetch = jest.fn();
  });

  it('sem sessão → 401, sem chamar a API', async () => {
    const res = createFakeRes();
    await searchHandler(createFakeReq({ method: 'GET', query: { q: 'abc' } }), res);
    expect(res._status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('com sessão → repassa o q para /api/platform/search', async () => {
    mockApi(200, { query: 'cli', groups: [] });
    const res = createFakeRes();
    await searchHandler(
      createFakeReq({ method: 'GET', cookies: loggedInCookies(), query: { q: 'cli' } }),
      res,
    );
    expect(String((fetch as jest.Mock).mock.calls[0][0])).toBe(
      'http://api-de-teste:4000/api/platform/search?q=cli',
    );
    expect(res._status).toBe(200);
  });

  it('método não-GET → 405', async () => {
    const res = createFakeRes();
    await searchHandler(createFakeReq({ method: 'POST', cookies: loggedInCookies() }), res);
    expect(res._status).toBe(405);
  });
});
