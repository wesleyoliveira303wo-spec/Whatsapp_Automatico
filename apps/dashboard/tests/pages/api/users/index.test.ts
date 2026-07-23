import handler from '../../../../pages/api/users/index';
import roleHandler from '../../../../pages/api/users/[userId]/role';
import resetHandler from '../../../../pages/api/users/[userId]/reset-password';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../../../lib/dashboardSession';
import { createFakeReq, createFakeRes } from '../../../testDoubles';

/**
 * Testes dos proxies do RH (Milestone 5, Bloco M5F-3): encaminhamento de
 * corpo/status/query para `apps/api` com a credencial da sessao — nenhuma
 * regra reimplementada no BFF (padrao dos demais proxies).
 */
describe('proxies /api/users/* (Milestone 5, Bloco M5F-3)', () => {
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

  it('sem sessao: 401 sem chamar a API', async () => {
    const req = createFakeReq({ method: 'GET', cookies: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('GET: repassa filtros de query e devolve a pagina da API com Bearer', async () => {
    mockApi(200, { users: [{ id: 'u1' }], nextCursor: 'u1' });
    const req = createFakeReq({
      method: 'GET',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      query: { limit: '10', status: 'active' },
    });
    const res = createFakeRes();

    await handler(req, res);

    const [url, init] = (fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('http://api-de-teste:4000/api/tenants/tenant-1/users?limit=10&status=active');
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ users: [{ id: 'u1' }], nextCursor: 'u1' });
  });

  it('POST: encaminha o corpo de criacao e o status da API (201)', async () => {
    mockApi(201, { user: { id: 'u2', email: 'maria@empresa.com' } });
    const req = createFakeReq({
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      body: { email: 'maria@empresa.com', role: 'operator', temporaryPassword: 'senha-provisoria' },
    });
    const res = createFakeRes();

    await handler(req, res);

    const [url, init] = (fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('http://api-de-teste:4000/api/tenants/tenant-1/users');
    expect(init.method).toBe('POST');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('erros de negocio da API passam intactos (409 email_already_in_use)', async () => {
    mockApi(409, { error: 'email_already_in_use' });
    const req = createFakeReq({
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      body: { email: 'maria@empresa.com', role: 'operator', temporaryPassword: 'senha-provisoria' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'email_already_in_use' });
  });

  it('PATCH /:userId/role: monta o path com o userId escapado', async () => {
    mockApi(200, { user: { id: 'u3', role: 'manager' } });
    const req = createFakeReq({
      method: 'PATCH',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      query: { userId: 'u3' },
      body: { role: 'manager' },
    });
    const res = createFakeRes();

    await roleHandler(req, res);

    const [url] = (fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('http://api-de-teste:4000/api/tenants/tenant-1/users/u3/role');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('POST /:userId/reset-password: encaminha a senha provisoria nova', async () => {
    mockApi(200, { user: { id: 'u3', mustChangePassword: true } });
    const req = createFakeReq({
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      query: { userId: 'u3' },
      body: { temporaryPassword: 'outra-senha-prov' },
    });
    const res = createFakeRes();

    await resetHandler(req, res);

    const [url, init] = (fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('http://api-de-teste:4000/api/tenants/tenant-1/users/u3/reset-password');
    expect(init.body).toBe(JSON.stringify({ temporaryPassword: 'outra-senha-prov' }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('metodo errado: 405', async () => {
    const req = createFakeReq({ method: 'DELETE', cookies: { [SESSION_COOKIE_NAME]: userCookie() } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
