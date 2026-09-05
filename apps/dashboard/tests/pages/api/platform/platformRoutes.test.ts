import loginHandler from '../../../../pages/api/platform/login';
import logoutHandler from '../../../../pages/api/platform/logout';
import meHandler from '../../../../pages/api/platform/me';
import {
  PLATFORM_CSRF_COOKIE_NAME,
  readPlatformSessionFromRequest,
  setPlatformSessionCookie,
  type PlatformSession,
} from '../../../../lib/platformSession';
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

describe('rotas /api/platform', () => {
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

  describe('POST /api/platform/login', () => {
    it('recusa método diferente de POST', async () => {
      const res = createFakeRes();

      await loginHandler(createFakeReq({ method: 'GET' }), res);

      expect(res._status).toBe(405);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('recusa corpo incompleto sem chamar a API', async () => {
      const res = createFakeRes();

      await loginHandler(createFakeReq({ method: 'POST', body: { email: 'x' } }), res);

      expect(res._status).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('login válido grava o cookie e NUNCA devolve o crachá ao navegador', async () => {
      mockApi(200, { token: 'cracha-secreto', user: SESSION.user });
      const res = createFakeRes();

      await loginHandler(
        createFakeReq({
          method: 'POST',
          body: { email: 'dono@francis.app', password: 'senha-forte' },
        }),
        res,
      );

      expect(res._status).toBe(200);
      expect(res._json).toEqual({ user: SESSION.user });
      expect(JSON.stringify(res._json)).not.toContain('cracha-secreto');

      const cookies = setCookieHeaders(res).join('; ');
      expect(cookies).toContain('wa_admin_session=');
      expect(cookies).not.toContain('cracha-secreto');
    });

    it('chama a rota de plataforma da API, sem tenant no caminho', async () => {
      mockApi(200, { token: 'x', user: SESSION.user });

      await loginHandler(
        createFakeReq({ method: 'POST', body: { email: 'a@b.c', password: 'senha' } }),
        createFakeRes(),
      );

      const [url] = (fetch as jest.Mock).mock.calls[0];
      expect(String(url)).toBe('http://api-de-teste:4000/api/platform/auth/login');
      expect(String(url)).not.toContain('/tenants/');
    });

    it('credencial inválida vira 401, sem cookie', async () => {
      mockApi(401, { error: 'invalid_credentials' });
      const res = createFakeRes();

      await loginHandler(
        createFakeReq({ method: 'POST', body: { email: 'a@b.c', password: 'errada' } }),
        res,
      );

      expect(res._status).toBe(401);
      expect(setCookieHeaders(res)).toEqual([]);
    });

    it('repassa a trava de conta (423) com o tempo restante', async () => {
      mockApi(423, { error: 'account_locked', retryAfterSeconds: 120 });
      const res = createFakeRes();

      await loginHandler(
        createFakeReq({ method: 'POST', body: { email: 'a@b.c', password: 'senha' } }),
        res,
      );

      expect(res._status).toBe(423);
      expect(res._json).toMatchObject({ retryAfterSeconds: 120 });
    });

    it('resposta malformada da API não vira sessão', async () => {
      mockApi(200, { user: SESSION.user });
      const res = createFakeRes();

      await loginHandler(
        createFakeReq({ method: 'POST', body: { email: 'a@b.c', password: 'senha' } }),
        res,
      );

      expect(res._status).toBe(502);
      expect(setCookieHeaders(res)).toEqual([]);
    });
  });

  describe('GET /api/platform/me', () => {
    it('sem sessão — 401, sem chamar a API', async () => {
      const res = createFakeRes();

      await meHandler(createFakeReq({ method: 'GET' }), res);

      expect(res._status).toBe(401);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('pergunta à API em vez de repetir o que está no cookie', async () => {
      mockApi(200, { user: SESSION.user });
      const res = createFakeRes();

      await meHandler(createFakeReq({ method: 'GET', cookies: loggedInCookies() }), res);

      const [url, init] = (fetch as jest.Mock).mock.calls[0];
      expect(String(url)).toBe('http://api-de-teste:4000/api/platform/auth/me');
      expect(init.headers.Authorization).toBe(`Bearer ${SESSION.token}`);
      expect(res._status).toBe(200);
    });

    it('API recusando o crachá derruba o cookie aqui mesmo', async () => {
      mockApi(401, { error: 'invalid_platform_session' });
      const res = createFakeRes();

      await meHandler(createFakeReq({ method: 'GET', cookies: loggedInCookies() }), res);

      expect(res._status).toBe(401);
      expect(setCookieHeaders(res).join('; ')).toContain('Max-Age=0');
    });
  });

  describe('POST /api/platform/logout', () => {
    function logoutReq(cookies = loggedInCookies()) {
      return createFakeReq({
        method: 'POST',
        cookies,
        headers: { 'x-csrf-token': cookies[PLATFORM_CSRF_COOKIE_NAME] },
      });
    }

    it('registra a saída e expira o cookie', async () => {
      mockApi(204, undefined);
      const res = createFakeRes();

      await logoutHandler(logoutReq(), res);

      expect(String((fetch as jest.Mock).mock.calls[0][0])).toBe(
        'http://api-de-teste:4000/api/platform/auth/logout',
      );
      expect(res._status).toBe(200);
      const header = setCookieHeaders(res).find((c) => c.startsWith('wa_admin_session='))!;
      expect(header).toContain('Max-Age=0');
      expect(readPlatformSessionFromRequest({ cookies: { wa_admin_session: '' } })).toBeNull();
    });

    it('sai mesmo com a API fora do ar — ninguém fica preso na sessão', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('sem rede'));
      const res = createFakeRes();

      await logoutHandler(logoutReq(), res);

      expect(res._status).toBe(200);
      expect(setCookieHeaders(res).join('; ')).toContain('Max-Age=0');
    });

    it('sem o token CSRF — 403, sem chamar a API', async () => {
      const res = createFakeRes();

      await logoutHandler(
        createFakeReq({ method: 'POST', cookies: loggedInCookies(), headers: {} }),
        res,
      );

      expect(res._status).toBe(403);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
