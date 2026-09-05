import handler from '../../../../pages/api/tenant';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../../../lib/dashboardSession';
import { createFakeReq, createFakeRes, sessionCookieValue } from '../../../testDoubles';

/** Mesmo truque de `me.test.ts`: token decodificável para `requireSession` não disparar refresh proativo. */
function fakeAccessToken(expiresInSeconds = 900): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds }),
  ).toString('base64url');
  return `header.${payload}.sig`;
}

/** Reorganização Perfil/Configurações (2026-08-27) — aba "Empresa". */
describe('/api/tenant', () => {
  const originalSecret = process.env.DASHBOARD_SESSION_SECRET;
  const originalApiBaseUrl = process.env.API_BASE_URL;

  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 11).toString('base64');
    process.env.API_BASE_URL = 'http://api-de-teste:4000';
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env.DASHBOARD_SESSION_SECRET = originalSecret;
    process.env.API_BASE_URL = originalApiBaseUrl;
  });

  function cookieFor(session: Parameters<typeof setSessionCookie>[1]): string {
    const res = createFakeRes();
    setSessionCookie(res, session);
    return sessionCookieValue(res);
  }

  const USER = {
    id: 'user-1',
    email: 'maria@empresa.com',
    role: 'manager',
    mustChangePassword: false,
  };

  it('sem sessao: 401', async () => {
    const req = createFakeReq({ method: 'GET', cookies: {} });
    const res = createFakeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('metodo nao suportado: 405', async () => {
    const cookie = cookieFor({ tenantId: 'tenant-1', apiKey: 'chave-1' });
    const req = createFakeReq({ method: 'DELETE', cookies: { [SESSION_COOKIE_NAME]: cookie } });
    const res = createFakeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('GET: repassa para /api/tenants/:tenantId da API com X-API-Key (sessao de MAQUINA)', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ tenant: { id: 'tenant-1', name: 'Empresa X' } }),
    });
    const cookie = cookieFor({ tenantId: 'tenant-1', apiKey: 'chave-1' });
    const req = createFakeReq({ method: 'GET', cookies: { [SESSION_COOKIE_NAME]: cookie } });
    const res = createFakeRes();

    await handler(req, res);

    expect(fetch).toHaveBeenCalledWith(
      new URL('/api/tenants/tenant-1/', 'http://api-de-teste:4000'),
      expect.objectContaining({ headers: expect.objectContaining({ 'X-API-Key': 'chave-1' }) }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ tenant: { id: 'tenant-1', name: 'Empresa X' } });
  });

  it('PATCH: name vazio -> 400, sem chamar a API', async () => {
    const cookie = cookieFor({
      tenantId: 'tenant-1',
      accessToken: fakeAccessToken(),
      refreshToken: 'ref-1',
      user: USER,
    });
    const req = createFakeReq({
      method: 'PATCH',
      cookies: { [SESSION_COOKIE_NAME]: cookie },
      body: { name: '' },
    });
    const res = createFakeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('PATCH: repassa com Bearer (sessao de PESSOA) e devolve o corpo/status da API', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      status: 403,
      ok: false,
      text: async () => JSON.stringify({ error: 'forbidden' }),
    });
    const accessToken = fakeAccessToken();
    const cookie = cookieFor({
      tenantId: 'tenant-1',
      accessToken,
      refreshToken: 'ref-1',
      user: USER,
    });
    const req = createFakeReq({
      method: 'PATCH',
      cookies: { [SESSION_COOKIE_NAME]: cookie },
      body: { name: 'Novo Nome' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(fetch).toHaveBeenCalledWith(
      new URL('/api/tenants/tenant-1/', 'http://api-de-teste:4000'),
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ Authorization: `Bearer ${accessToken}` }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'forbidden' });
  });
});
