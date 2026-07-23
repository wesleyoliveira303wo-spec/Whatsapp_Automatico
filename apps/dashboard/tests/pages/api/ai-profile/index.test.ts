import handler from '../../../../pages/api/ai-profile/index';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../../../lib/dashboardSession';
import { createFakeReq, createFakeRes } from '../../../testDoubles';

/**
 * Testes do proxy da Base de Conhecimento (Nível 1): encaminha GET/PUT para
 * `apps/api` com a credencial da sessão — nenhuma regra reimplementada no BFF
 * (mesmo padrão dos demais proxies).
 */
describe('proxy /api/ai-profile (Base de Conhecimento — Nível 1)', () => {
  const originalSecret = process.env.DASHBOARD_SESSION_SECRET;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 13).toString('base64');
    process.env.API_BASE_URL = 'http://api-de-teste:4000';
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env.DASHBOARD_SESSION_SECRET = originalSecret;
    process.env.API_BASE_URL = originalApiBaseUrl;
    global.fetch = originalFetch;
  });

  function freshAccessToken(): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url');
    return `${header}.${payload}.sig`;
  }

  function userCookie(): string {
    const res = createFakeRes();
    setSessionCookie(res, {
      tenantId: 'tenant-1',
      accessToken: freshAccessToken(),
      refreshToken: 'ref-1',
      user: { id: 'admin-1', email: 'chefe@empresa.com', role: 'administrator', mustChangePassword: false },
    });
    const match = (res._headers['Set-Cookie'] as string).match(new RegExp(`^${SESSION_COOKIE_NAME}=([^;]*)`));
    return match![1];
  }

  function mockApi(status: number, body: unknown): void {
    (fetch as jest.Mock).mockResolvedValue({ status, text: async () => JSON.stringify(body) });
  }

  it('sem sessão: 401 sem chamar a API', async () => {
    const req = createFakeReq({ method: 'GET', cookies: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('GET: devolve o perfil da API com Bearer no path /ai-profile', async () => {
    mockApi(200, { profile: { tenantId: 'tenant-1', content: 'Salão da Maria.', updatedAt: '2026-07-22T10:00:00.000Z' } });
    const req = createFakeReq({ method: 'GET', cookies: { [SESSION_COOKIE_NAME]: userCookie() } });
    const res = createFakeRes();

    await handler(req, res);

    const [url, init] = (fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('http://api-de-teste:4000/api/tenants/tenant-1/ai-profile');
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ profile: { tenantId: 'tenant-1', content: 'Salão da Maria.', updatedAt: '2026-07-22T10:00:00.000Z' } });
  });

  it('PUT: encaminha o corpo (content) e devolve o status da API (200)', async () => {
    mockApi(200, { profile: { tenantId: 'tenant-1', content: 'Barbearia do João.', updatedAt: '2026-07-22T11:00:00.000Z' } });
    const req = createFakeReq({
      method: 'PUT',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      body: { content: 'Barbearia do João.' },
    });
    const res = createFakeRes();

    await handler(req, res);

    const [url, init] = (fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('http://api-de-teste:4000/api/tenants/tenant-1/ai-profile');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ content: 'Barbearia do João.' }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('erros da API passam intactos (403 forbidden)', async () => {
    mockApi(403, { error: 'forbidden' });
    const req = createFakeReq({
      method: 'PUT',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      body: { content: 'x' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'forbidden' });
  });

  it('método errado: 405', async () => {
    const req = createFakeReq({ method: 'DELETE', cookies: { [SESSION_COOKIE_NAME]: userCookie() } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
