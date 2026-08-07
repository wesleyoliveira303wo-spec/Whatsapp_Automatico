import handler from '../../../../pages/api/auth/change-password';
import {
  setSessionCookie,
  readSessionFromRequest,
  SESSION_COOKIE_NAME,
} from '../../../../lib/dashboardSession';
import { createFakeReq, createFakeRes } from '../../../testDoubles';

/**
 * Testes da rota BFF de troca de senha (Milestone 5, Bloco M5F-2): repasse
 * para a API + RELOGIN automatico com regravacao do cookie (a sessao local
 * sobrevive; as outras morrem na API).
 */
describe('POST /api/auth/change-password', () => {
  const originalSecret = process.env.DASHBOARD_SESSION_SECRET;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 9).toString('base64');
    process.env.API_BASE_URL = 'http://api-de-teste:4000';
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env.DASHBOARD_SESSION_SECRET = originalSecret;
    process.env.API_BASE_URL = originalApiBaseUrl;
    global.fetch = originalFetch;
  });

  /** Access token com o formato real (3 segmentos, exp no payload) e validade LONGA — o requireSession nao deve tentar renovar no meio destes testes. */
  function freshAccessToken(): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 }),
    ).toString('base64url');
    return `${header}.${payload}.sig`;
  }

  function cookieFor(session: Parameters<typeof setSessionCookie>[1]): string {
    const res = createFakeRes();
    setSessionCookie(res, session);
    const match = (res._headers['Set-Cookie'] as string).match(
      new RegExp(`^${SESSION_COOKIE_NAME}=([^;]*)`),
    );
    return match![1];
  }

  function userCookie(): string {
    return cookieFor({
      tenantId: 'tenant-1',
      accessToken: freshAccessToken(),
      refreshToken: 'ref-1',
      user: {
        id: 'user-1',
        email: 'maria@empresa.com',
        role: 'operator',
        mustChangePassword: true,
      },
    });
  }

  const BODY = { currentPassword: 'provisoria', newPassword: 'senha-nova-forte' };

  it('405 para metodos diferentes de POST', async () => {
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('sessao de MAQUINA (API key): 403 user_session_required — nao ha senha para trocar', async () => {
    const cookie = cookieFor({ tenantId: 'tenant-1', apiKey: 'chave' });
    const req = createFakeReq({
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: cookie },
      body: BODY,
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'user_session_required' }),
    );
  });

  it('body incompleto: 400 sem chamar a API', async () => {
    const req = createFakeReq({
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      body: { currentPassword: 'x' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('caminho feliz: troca na API, RELOGA com a senha nova, regrava o cookie (mustChangePassword false) e responde 204', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, status: 204 }) // change-password
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ accessToken: freshAccessToken(), refreshToken: 'ref-2', user: {} }),
      }); // relogin
    const req = createFakeReq({
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      body: BODY,
    });
    const res = createFakeRes();

    await handler(req, res);

    const calls = (fetch as jest.Mock).mock.calls;
    expect(String(calls[0][0])).toContain('/auth/change-password');
    expect(String(calls[1][0])).toContain('/auth/login');
    expect(JSON.parse(calls[1][1].body as string)).toEqual({
      email: 'maria@empresa.com',
      password: 'senha-nova-forte',
    });

    // Cookie regravado: refresh novo e post-it de senha provisoria removido.
    const rewritten = (res._headers['Set-Cookie'] as string).match(
      new RegExp(`^${SESSION_COOKIE_NAME}=([^;]*)`),
    )![1];
    const session = readSessionFromRequest(
      createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: rewritten } }),
    );
    expect(session?.refreshToken).toBe('ref-2');
    expect(session?.user?.mustChangePassword).toBe(false);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('senha atual errada: API 401 -> 401 invalid_current_password, cookie intacto', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });
    const req = createFakeReq({
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      body: BODY,
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_current_password' });
    expect(res._headers['Set-Cookie']).toBeUndefined();
  });

  it('senha nova fraca: API 422 -> 422 weak_password', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 422 });
    const req = createFakeReq({
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      body: BODY,
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: 'weak_password' });
  });

  it('senha trocada mas relogin falhou: limpa o cookie (sessao local cai, sem refresh morto) e responde 204', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, status: 204 }) // change-password ok
      .mockRejectedValueOnce(new Error('ECONNREFUSED')); // relogin falha
    const req = createFakeReq({
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: userCookie() },
      body: BODY,
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res._headers['Set-Cookie']).toMatch(/Max-Age=0/);
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
