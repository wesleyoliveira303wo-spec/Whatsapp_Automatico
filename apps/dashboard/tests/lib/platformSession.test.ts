import {
  PLATFORM_CSRF_COOKIE_NAME,
  PLATFORM_SESSION_COOKIE_NAME,
  clearPlatformSessionCookie,
  readPlatformSessionFromRequest,
  requirePlatformSession,
  setPlatformSessionCookie,
  type PlatformSession,
} from '../../lib/platformSession';
import { createFakeReq, createFakeRes, setCookieHeaders, type FakeResponse } from '../testDoubles';

const SECRET = Buffer.alloc(32, 9).toString('base64');

const SESSION: PlatformSession = {
  token: 'cracha-de-plataforma',
  user: { id: 'admin-1', email: 'dono@francis.app', name: 'Dono' },
};

/** Grava a sessão numa resposta e devolve os cookies como o navegador guardaria. */
function issueCookies(session: PlatformSession = SESSION): Record<string, string> {
  const res = createFakeRes();
  setPlatformSessionCookie(res, session);
  const cookies: Record<string, string> = {};
  for (const header of setCookieHeaders(res)) {
    const [pair] = header.split(';');
    const index = pair.indexOf('=');
    cookies[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return cookies;
}

describe('platformSession — cookie', () => {
  const original = process.env.PLATFORM_DASHBOARD_SESSION_SECRET;

  beforeEach(() => {
    process.env.PLATFORM_DASHBOARD_SESSION_SECRET = SECRET;
  });

  afterAll(() => {
    process.env.PLATFORM_DASHBOARD_SESSION_SECRET = original;
  });

  it('grava a sessão cifrada, httpOnly, e o espelho legível do token CSRF', () => {
    const res = createFakeRes();

    setPlatformSessionCookie(res, SESSION);

    const headers = setCookieHeaders(res);
    const sessionCookie = headers.find((c) => c.startsWith(`${PLATFORM_SESSION_COOKIE_NAME}=`))!;
    const csrfCookie = headers.find((c) => c.startsWith(`${PLATFORM_CSRF_COOKIE_NAME}=`))!;

    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');
    // O crachá nunca aparece em claro no cabeçalho.
    expect(sessionCookie).not.toContain('cracha-de-plataforma');
    // O espelho do CSRF é legível por JS de propósito.
    expect(csrfCookie).not.toContain('HttpOnly');
  });

  it('usa nomes de cookie PRÓPRIOS — nunca os do produto', () => {
    const res = createFakeRes();

    setPlatformSessionCookie(res, SESSION);

    const joined = setCookieHeaders(res).join('; ');
    expect(joined).not.toContain('wa_dashboard_session');
    expect(joined).toContain('wa_admin_session');
  });

  it('lê de volta o que gravou', () => {
    const cookies = issueCookies();

    const session = readPlatformSessionFromRequest({ cookies });

    expect(session).toMatchObject({ token: SESSION.token, user: SESSION.user });
    expect(session?.csrfToken).toEqual(expect.any(String));
  });

  it('devolve null para cookie ausente, corrompido ou cifrado com outro segredo', () => {
    const cookies = issueCookies();

    expect(readPlatformSessionFromRequest({ cookies: {} })).toBeNull();
    expect(
      readPlatformSessionFromRequest({ cookies: { [PLATFORM_SESSION_COOKIE_NAME]: 'lixo' } }),
    ).toBeNull();

    process.env.PLATFORM_DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 1).toString('base64');
    expect(readPlatformSessionFromRequest({ cookies })).toBeNull();
  });

  it('devolve null sem o segredo configurado, em vez de lançar', () => {
    const cookies = issueCookies();
    delete process.env.PLATFORM_DASHBOARD_SESSION_SECRET;

    expect(() => readPlatformSessionFromRequest({ cookies })).not.toThrow();
    expect(readPlatformSessionFromRequest({ cookies })).toBeNull();
  });

  it('limpar expira os dois cookies', () => {
    const res = createFakeRes();

    clearPlatformSessionCookie(res);

    for (const header of setCookieHeaders(res)) {
      expect(header).toContain('Max-Age=0');
    }
  });
});

describe('requirePlatformSession', () => {
  const original = process.env.PLATFORM_DASHBOARD_SESSION_SECRET;

  beforeEach(() => {
    process.env.PLATFORM_DASHBOARD_SESSION_SECRET = SECRET;
  });

  afterAll(() => {
    process.env.PLATFORM_DASHBOARD_SESSION_SECRET = original;
  });

  function call(
    req: Parameters<typeof requirePlatformSession>[0],
  ): { session: PlatformSession | null; res: FakeResponse } {
    const res = createFakeRes();
    return { session: requirePlatformSession(req, res), res };
  }

  it('sem cookie — 401', () => {
    const { session, res } = call(createFakeReq({ method: 'GET' }));

    expect(session).toBeNull();
    expect(res._status).toBe(401);
  });

  it('GET com cookie válido — devolve a sessão', () => {
    const cookies = issueCookies();

    const { session } = call(createFakeReq({ method: 'GET', cookies }));

    expect(session).toMatchObject({ user: SESSION.user });
  });

  it('POST sem o cabeçalho CSRF — 403', () => {
    const cookies = issueCookies();

    const { session, res } = call(createFakeReq({ method: 'POST', cookies, headers: {} }));

    expect(session).toBeNull();
    expect(res._status).toBe(403);
    expect(res._json).toMatchObject({ error: 'invalid_csrf_token' });
  });

  it('POST com token CSRF divergente — 403', () => {
    const cookies = issueCookies();

    const { session, res } = call(
      createFakeReq({ method: 'POST', cookies, headers: { 'x-csrf-token': 'outro-token' } }),
    );

    expect(session).toBeNull();
    expect(res._status).toBe(403);
  });

  it('POST com o token CSRF certo — passa', () => {
    const cookies = issueCookies();

    const { session } = call(
      createFakeReq({
        method: 'POST',
        cookies,
        headers: { 'x-csrf-token': cookies[PLATFORM_CSRF_COOKIE_NAME] },
      }),
    );

    expect(session).toMatchObject({ user: SESSION.user });
  });

  it('POST de outra origem — 403 antes de qualquer outra checagem', () => {
    const cookies = issueCookies();

    const { session, res } = call(
      createFakeReq({
        method: 'POST',
        cookies,
        headers: {
          origin: 'https://site-atacante.example',
          host: 'painel.francis.app',
          'x-csrf-token': cookies[PLATFORM_CSRF_COOKIE_NAME],
        },
      }),
    );

    expect(session).toBeNull();
    expect(res._status).toBe(403);
    expect(res._json).toMatchObject({ error: 'cross_origin_request_blocked' });
  });

  it('um cookie de sessão do PRODUTO não abre o painel', () => {
    const { session, res } = call(
      createFakeReq({ method: 'GET', cookies: { wa_dashboard_session: 'qualquer-coisa' } }),
    );

    expect(session).toBeNull();
    expect(res._status).toBe(401);
  });
});
