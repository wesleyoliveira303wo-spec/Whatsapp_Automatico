import handler from '../../../../pages/api/conversations/[conversationId]/messages';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../../../lib/dashboardSession';
import { createFakeReq, createFakeRes, sessionCookieValue } from '../../../testDoubles';

/**
 * Testes do proxy de mensagens de uma conversa (feature N2): GET (histórico) e
 * POST (envio do operador) encaminhados para `apps/api` com a credencial da
 * sessão. RBAC/estado impostos pela API — nunca reimplementados no BFF.
 */
describe('proxy /api/conversations/[id]/messages', () => {
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
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 }),
    ).toString('base64url');
    return `${header}.${payload}.sig`;
  }

  function userCookie(): string {
    const res = createFakeRes();
    setSessionCookie(res, {
      tenantId: 'tenant-1',
      accessToken: freshAccessToken(),
      refreshToken: 'ref-1',
      user: { id: 'op-1', email: 'op@empresa.com', role: 'operator', mustChangePassword: false },
    });
    return sessionCookieValue(res);
  }

  function mockApi(status: number, body: unknown): void {
    (fetch as jest.Mock).mockResolvedValue({ status, text: async () => JSON.stringify(body) });
  }

  it('sem sessão: 401 sem chamar a API', async () => {
    const req = createFakeReq({ method: 'POST', cookies: {}, query: { conversationId: 'c1' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POST: encaminha o corpo (content) para /:id/messages e devolve o 202 da API', async () => {
    mockApi(202, { status: 'queued' });
    const req = createFakeReq({
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      query: { conversationId: 'c1' },
      body: { content: 'Oi, posso ajudar!' },
    });
    const res = createFakeRes();

    await handler(req, res);

    const [url, init] = (fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe(
      'http://api-de-teste:4000/api/tenants/tenant-1/conversations/c1/messages',
    );
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ content: 'Oi, posso ajudar!' }));
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('POST: erros da API passam intactos (409 conversation_not_human)', async () => {
    mockApi(409, { error: 'conversation_not_human' });
    const req = createFakeReq({
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      query: { conversationId: 'c1' },
      body: { content: 'oi' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'conversation_not_human' });
  });

  it('GET: continua funcionando (histórico) com a query limit', async () => {
    mockApi(200, { messages: [] });
    const req = createFakeReq({
      method: 'GET',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      query: { conversationId: 'c1', limit: '50' },
    });
    const res = createFakeRes();

    await handler(req, res);

    const [url] = (fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe(
      'http://api-de-teste:4000/api/tenants/tenant-1/conversations/c1/messages?limit=50',
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('método não suportado: 405', async () => {
    const req = createFakeReq({
      method: 'DELETE',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      query: { conversationId: 'c1' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
