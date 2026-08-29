import {
  setSessionCookie,
  clearSessionCookie,
  readSessionFromRequest,
  requireSession,
  getAccessTokenExpiration,
  SESSION_COOKIE_NAME,
} from '../../lib/dashboardSession';
import { createFakeReq, createFakeRes } from '../testDoubles';

const VALID_SECRET = Buffer.alloc(32, 3).toString('base64');

/** Extrai o valor do cookie de um cabeçalho `Set-Cookie` no formato produzido por `serializeCookie()` (`nome=valor; Path=/; ...`). */
function extractCookieValue(setCookieHeader: string): string {
  const match = setCookieHeader.match(new RegExp(`^${SESSION_COOKIE_NAME}=([^;]*)`));
  if (!match) throw new Error('Set-Cookie header não contém o cookie esperado');
  return match[1];
}

describe('dashboardSession', () => {
  const originalSecret = process.env.DASHBOARD_SESSION_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = VALID_SECRET;
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env.DASHBOARD_SESSION_SECRET = originalSecret;
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('setSessionCookie / readSessionFromRequest (round-trip)', () => {
    it('grava um cookie que, lido de volta, devolve a MESMA sessão', () => {
      const res = createFakeRes();
      setSessionCookie(res, { tenantId: 'tenant-1', apiKey: 'chave-secreta' });

      const setCookieHeader = res._headers['Set-Cookie'] as string;
      const cookieValue = extractCookieValue(setCookieHeader);
      const req = createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: cookieValue } });

      expect(readSessionFromRequest(req)).toEqual({
        tenantId: 'tenant-1',
        apiKey: 'chave-secreta',
      });
    });

    it('o cookie gravado é HttpOnly, SameSite=Lax e tem Max-Age > 0', () => {
      const res = createFakeRes();
      setSessionCookie(res, { tenantId: 'tenant-1', apiKey: 'chave' });

      const setCookieHeader = res._headers['Set-Cookie'] as string;
      expect(setCookieHeader).toMatch(/HttpOnly/);
      expect(setCookieHeader).toMatch(/SameSite=Lax/);
      expect(setCookieHeader).toMatch(/Max-Age=43200/); // 12h em segundos
    });

    it('NÃO inclui Secure fora de produção (permite localhost sem HTTPS em dev)', () => {
      process.env.NODE_ENV = 'development';
      const res = createFakeRes();
      setSessionCookie(res, { tenantId: 'tenant-1', apiKey: 'chave' });

      expect(res._headers['Set-Cookie']).not.toMatch(/Secure/);
    });

    it('inclui Secure em produção', () => {
      process.env.NODE_ENV = 'production';
      const res = createFakeRes();
      setSessionCookie(res, { tenantId: 'tenant-1', apiKey: 'chave' });

      expect(res._headers['Set-Cookie']).toMatch(/Secure/);
    });

    /**
     * Bug real 2026-08-28: `user.avatarUrl` (uma `data:` URI de foto de
     * perfil, ~22 KB) ia inteiro para o payload do cookie, gerando um
     * `Set-Cookie` de ~30 KB. O navegador descarta silenciosamente um cookie
     * acima de ~4 KB — a sessão nunca "colava" e o usuário ficava preso num
     * loop `/login` ⇄ `/`. O `avatarUrl` não pode ir no cookie.
     */
    it('NÃO coloca avatarUrl no cookie, mesmo que seja uma data: URI enorme', () => {
      const hugeAvatar = `data:image/jpeg;base64,${'A'.repeat(60_000)}`;
      const res = createFakeRes();
      setSessionCookie(res, {
        tenantId: 'tenant-1',
        accessToken: 'a'.repeat(24),
        refreshToken: 'r'.repeat(24),
        user: {
          id: 'user-1',
          email: 'wesley@empresa.com',
          role: 'owner',
          mustChangePassword: false,
          name: 'Wesley',
          avatarUrl: hugeAvatar,
        },
      });

      const cookieValue = extractCookieValue(res._headers['Set-Cookie'] as string);
      // Cabe com folga no limite prático de ~4 KB do navegador.
      expect(cookieValue.length).toBeLessThan(3800);

      const back = readSessionFromRequest(
        createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: cookieValue } }),
      );
      expect(back?.user?.avatarUrl).toBeUndefined();
      // ...mas o resto da identidade continua intacto.
      expect(back?.user?.name).toBe('Wesley');
      expect(back?.user?.email).toBe('wesley@empresa.com');
      expect(back?.user?.role).toBe('owner');
    });
  });

  describe('readSessionFromRequest — casos de ausência/invalidade', () => {
    it('devolve null quando não há cookie nenhum', () => {
      expect(readSessionFromRequest(createFakeReq({ cookies: {} }))).toBeNull();
    });

    it('devolve null quando DASHBOARD_SESSION_SECRET não está configurada', () => {
      delete process.env.DASHBOARD_SESSION_SECRET;
      const req = createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: 'qualquer-coisa' } });

      expect(readSessionFromRequest(req)).toBeNull();
    });

    it('devolve null quando o cookie foi cifrado com uma chave diferente da atual', () => {
      const res = createFakeRes();
      setSessionCookie(res, { tenantId: 'tenant-1', apiKey: 'chave' });
      const cookieValue = extractCookieValue(res._headers['Set-Cookie'] as string);

      process.env.DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 99).toString('base64'); // outra chave
      const req = createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: cookieValue } });

      expect(readSessionFromRequest(req)).toBeNull();
    });
  });

  describe('clearSessionCookie', () => {
    it('grava Max-Age=0 (expira imediatamente)', () => {
      const res = createFakeRes();
      clearSessionCookie(res);

      expect(res._headers['Set-Cookie']).toMatch(/Max-Age=0/);
    });
  });

  describe('requireSession', () => {
    it('devolve a sessão sem tocar a resposta quando o cookie é válido', async () => {
      const res = createFakeRes();
      setSessionCookie(res, { tenantId: 'tenant-1', apiKey: 'chave' });
      const cookieValue = extractCookieValue(res._headers['Set-Cookie'] as string);

      const req = createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: cookieValue } });
      const res2 = createFakeRes();

      const session = await requireSession(req, res2);

      expect(session).toEqual({ tenantId: 'tenant-1', apiKey: 'chave' });
      expect(res2.status).not.toHaveBeenCalled();
    });

    it('responde 401 not_authenticated e devolve null quando não há sessão', async () => {
      const req = createFakeReq({ cookies: {} });
      const res = createFakeRes();

      const session = await requireSession(req, res);

      expect(session).toBeNull();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'not_authenticated' });
    });
  });

  // --- Milestone 5, Bloco M5F-1: sessao de PESSOA + renovacao proativa ---

  /** Monta um "access token" com o mesmo FORMATO do real (h.payload.sig, base64url) — o BFF so le o `exp`, nunca verifica assinatura. */
  function fakeAccessToken(expEpochSeconds: number): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ exp: expEpochSeconds, userId: 'user-1' }),
    ).toString('base64url');
    return `${header}.${payload}.assinatura-falsa`;
  }

  function userSession(expEpochSeconds: number): {
    tenantId: string;
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; role: string; mustChangePassword: boolean };
  } {
    return {
      tenantId: 'tenant-1',
      accessToken: fakeAccessToken(expEpochSeconds),
      refreshToken: 'refresh-1',
      user: {
        id: 'user-1',
        email: 'maria@empresa.com',
        role: 'operator',
        mustChangePassword: false,
      },
    };
  }

  function cookieFor(session: Parameters<typeof setSessionCookie>[1]): string {
    const res = createFakeRes();
    setSessionCookie(res, session);
    return extractCookieValue(res._headers['Set-Cookie'] as string);
  }

  describe('sessao de PESSOA (M5F-1)', () => {
    const originalFetch = global.fetch;
    const originalApiBaseUrl = process.env.API_BASE_URL;

    beforeEach(() => {
      process.env.API_BASE_URL = 'http://api.local';
    });

    afterEach(() => {
      global.fetch = originalFetch;
      process.env.API_BASE_URL = originalApiBaseUrl;
    });

    it('round-trip: cookie de pessoa lido de volta preserva tokens e user', () => {
      const session = userSession(Math.floor(Date.now() / 1000) + 900);
      const req = createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: cookieFor(session) } });

      expect(readSessionFromRequest(req)).toEqual(session);
    });

    it('payload sem apiKey E sem tokens e rejeitado (null)', () => {
      const req = createFakeReq({
        cookies: { [SESSION_COOKIE_NAME]: cookieFor({ tenantId: 'tenant-1' } as never) },
      });

      expect(readSessionFromRequest(req)).toBeNull();
    });

    it('getAccessTokenExpiration le o exp do payload; token malformado devolve null', () => {
      expect(getAccessTokenExpiration(fakeAccessToken(1_234_567))).toBe(1_234_567);
      expect(getAccessTokenExpiration('nao-e-um-token')).toBeNull();
      expect(getAccessTokenExpiration('a.b.c')).toBeNull();
    });

    it('cracha ainda valido (> 60s): passa direto, SEM chamar a API', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      const session = userSession(Math.floor(Date.now() / 1000) + 900);
      const req = createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: cookieFor(session) } });
      const res = createFakeRes();

      const result = await requireSession(req, res);

      expect(result).toEqual(session);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(res._headers['Set-Cookie']).toBeUndefined();
    });

    it('cracha vencendo: renova na API, regrava o cookie com os tokens novos e devolve a sessao renovada', async () => {
      const newToken = fakeAccessToken(Math.floor(Date.now() / 1000) + 900);
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ accessToken: newToken, refreshToken: 'refresh-2' }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const session = userSession(Math.floor(Date.now() / 1000) + 10); // < 60s
      const req = createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: cookieFor(session) } });
      const res = createFakeRes();

      const result = await requireSession(req, res);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/api/tenants/tenant-1/auth/refresh' }),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result).toEqual({ ...session, accessToken: newToken, refreshToken: 'refresh-2' });
      // Cookie regravado com a sessao renovada (rotacao persistida).
      const rewritten = extractCookieValue(res._headers['Set-Cookie'] as string);
      const reread = readSessionFromRequest(
        createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: rewritten } }),
      );
      expect(reread).toEqual({ ...session, accessToken: newToken, refreshToken: 'refresh-2' });
    });

    /**
     * HOTFIX 2026-08-25 — achado real: várias conexões SSE da mesma página
     * (Conversas, Sessões, Mensagens...) chamam `requireSession`
     * independentemente. Quando o token de todas precisa renovar no MESMO
     * instante (ex.: um redeploy do Dashboard derruba e reconecta TODAS as
     * SSE de uma vez), cada uma lia o MESMO `refreshToken` do cookie (ainda
     * não atualizado) e disparava sua PRÓPRIA chamada a `/auth/refresh` —
     * a segunda chamada em diante, usando um token JÁ CONSUMIDO pela
     * primeira, cai na detecção de reuso da API, que revoga TODOS os
     * refresh tokens do usuário, derrubando a sessão inteira. Medido no
     * Postgres: várias linhas de `refresh_tokens` criadas/revogadas em
     * menos de 200ms para o mesmo usuário.
     */
    it('HOTFIX 2026-08-25: duas chamadas concorrentes de requireSession com o MESMO refreshToken fazem só UMA chamada à API (dedupe da corrida de renovação)', async () => {
      const newToken = fakeAccessToken(Math.floor(Date.now() / 1000) + 900);
      let resolveFetch: (value: { ok: true; json: () => Promise<unknown> }) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve as never;
      });
      const fetchMock = jest.fn().mockReturnValue(fetchPromise);
      global.fetch = fetchMock as unknown as typeof fetch;

      const session = userSession(Math.floor(Date.now() / 1000) + 10); // < 60s, precisa renovar
      const cookie = cookieFor(session);
      const req1 = createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: cookie } });
      const res1 = createFakeRes();
      const req2 = createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: cookie } });
      const res2 = createFakeRes();

      // As duas chamadas partem ANTES de qualquer uma delas terminar — a
      // segunda deve encontrar a renovação da primeira já em andamento e
      // esperar por ela, em vez de disparar uma chamada própria.
      const result1Promise = requireSession(req1, res1);
      const result2Promise = requireSession(req2, res2);

      resolveFetch!({
        ok: true,
        json: async () => ({ accessToken: newToken, refreshToken: 'refresh-2' }),
      });
      const [result1, result2] = await Promise.all([result1Promise, result2Promise]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result1).toEqual({ ...session, accessToken: newToken, refreshToken: 'refresh-2' });
      expect(result2).toEqual({ ...session, accessToken: newToken, refreshToken: 'refresh-2' });
    });

    it('renovacao recusada pela API (refresh revogado): limpa o cookie e responde 401', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
      global.fetch = fetchMock as unknown as typeof fetch;

      const session = userSession(Math.floor(Date.now() / 1000) - 10); // ja vencido
      const req = createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: cookieFor(session) } });
      const res = createFakeRes();

      const result = await requireSession(req, res);

      expect(result).toBeNull();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res._headers['Set-Cookie']).toMatch(/Max-Age=0/);
    });

    it('API fora do ar durante a renovacao: tambem derruba a sessao (401), nunca lanca', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

      const session = userSession(Math.floor(Date.now() / 1000) - 10);
      const req = createFakeReq({ cookies: { [SESSION_COOKIE_NAME]: cookieFor(session) } });
      const res = createFakeRes();

      const result = await requireSession(req, res);

      expect(result).toBeNull();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
