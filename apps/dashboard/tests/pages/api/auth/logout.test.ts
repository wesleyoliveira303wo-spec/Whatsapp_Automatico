import handler from '../../../../pages/api/auth/logout';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../../../lib/dashboardSession';
import { createFakeReq, createFakeRes } from '../../../testDoubles';

describe('POST /api/auth/logout', () => {
  const originalSecret = process.env.DASHBOARD_SESSION_SECRET;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 7).toString('base64');
    process.env.API_BASE_URL = 'http://api-de-teste:4000';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
  });

  afterAll(() => {
    process.env.DASHBOARD_SESSION_SECRET = originalSecret;
    process.env.API_BASE_URL = originalApiBaseUrl;
    global.fetch = originalFetch;
  });

  function cookieFor(session: Parameters<typeof setSessionCookie>[1]): string {
    const res = createFakeRes();
    setSessionCookie(res, session);
    const match = (res._headers['Set-Cookie'] as string).match(new RegExp(`^${SESSION_COOKIE_NAME}=([^;]*)`));
    return match![1];
  }

  it('responde 405 para métodos diferentes de POST', async () => {
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('limpa o cookie (Max-Age=0) e responde 204', async () => {
    const req = createFakeReq({ method: 'POST' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res._headers['Set-Cookie']).toMatch(/Max-Age=0/);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('é idempotente: responde 204 mesmo sem nenhuma sessão ativa', async () => {
    const req = createFakeReq({ method: 'POST', cookies: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('sessão de MAQUINA (API key): NÃO chama a API, só limpa o cookie (comportamento original)', async () => {
    const cookie = cookieFor({ tenantId: 'tenant-1', apiKey: 'chave' });
    const req = createFakeReq({ method: 'POST', cookies: { [SESSION_COOKIE_NAME]: cookie } });
    const res = createFakeRes();

    await handler(req, res);

    expect(fetch).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });

  // --- Milestone 5, Bloco M5F-1 ---
  it('sessão de PESSOA: revoga o refresh token na API antes de limpar o cookie', async () => {
    const cookie = cookieFor({
      tenantId: 'tenant-1',
      accessToken: 'acc-1',
      refreshToken: 'ref-1',
      user: { id: 'user-1', email: 'maria@empresa.com', role: 'operator', mustChangePassword: false },
    });
    const req = createFakeReq({ method: 'POST', cookies: { [SESSION_COOKIE_NAME]: cookie } });
    const res = createFakeRes();

    await handler(req, res);

    expect(fetch).toHaveBeenCalledWith(
      new URL('/api/tenants/tenant-1/auth/logout', 'http://api-de-teste:4000'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer acc-1' }),
        body: JSON.stringify({ refreshToken: 'ref-1' }),
      }),
    );
    expect(res._headers['Set-Cookie']).toMatch(/Max-Age=0/);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('revogação é best-effort: API fora do ar NÃO impede o logout local (204)', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    const cookie = cookieFor({
      tenantId: 'tenant-1',
      accessToken: 'acc-1',
      refreshToken: 'ref-1',
      user: { id: 'user-1', email: 'maria@empresa.com', role: 'operator', mustChangePassword: false },
    });
    const req = createFakeReq({ method: 'POST', cookies: { [SESSION_COOKIE_NAME]: cookie } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res._headers['Set-Cookie']).toMatch(/Max-Age=0/);
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
