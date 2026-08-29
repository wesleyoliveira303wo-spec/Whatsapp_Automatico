import handler from '../../../../pages/api/auth/me';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../../../lib/dashboardSession';
import { createFakeReq, createFakeRes } from '../../../testDoubles';

describe('GET /api/auth/me (Milestone 5, Bloco M5F-2)', () => {
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
    const match = (res._headers['Set-Cookie'] as string).match(
      new RegExp(`^${SESSION_COOKIE_NAME}=([^;]*)`),
    );
    return match![1];
  }

  it('405 para metodos diferentes de GET', () => {
    const req = createFakeReq({ method: 'POST' });
    const res = createFakeRes();
    handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('sem sessao: 401 not_authenticated', () => {
    const req = createFakeReq({ method: 'GET', cookies: {} });
    const res = createFakeRes();
    handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('sessao de MAQUINA: user null e NUNCA expoe a apiKey', () => {
    const cookie = cookieFor({ tenantId: 'tenant-1', apiKey: 'chave-secreta' });
    const req = createFakeReq({ method: 'GET', cookies: { [SESSION_COOKIE_NAME]: cookie } });
    const res = createFakeRes();

    handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ tenantId: 'tenant-1', user: null });
    expect(JSON.stringify((res.json as jest.Mock).mock.calls[0][0])).not.toContain('chave-secreta');
  });

  it('sessao de PESSOA: devolve o user e NUNCA os tokens', async () => {
    const user = {
      id: 'user-1',
      email: 'maria@empresa.com',
      role: 'manager',
      mustChangePassword: false,
      name: 'Maria',
    };
    // O GET agora enriquece o `user` com o perfil fresco da API (nome/foto).
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { ...user, avatarUrl: 'data:image/jpeg;base64,AAAA' } }),
    });
    const cookie = cookieFor({
      tenantId: 'tenant-1',
      accessToken: 'acc-1',
      refreshToken: 'ref-1',
      user,
    });
    const req = createFakeReq({ method: 'GET', cookies: { [SESSION_COOKIE_NAME]: cookie } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const returned = (res.json as jest.Mock).mock.calls[0][0];
    expect(returned.tenantId).toBe('tenant-1');
    expect(returned.user).toMatchObject({ id: 'user-1', email: 'maria@empresa.com', name: 'Maria' });
    // A foto vem da API (nunca do cookie).
    expect(returned.user.avatarUrl).toBe('data:image/jpeg;base64,AAAA');
    const body = JSON.stringify(returned);
    expect(body).not.toContain('acc-1');
    expect(body).not.toContain('ref-1');
  });

  it('sessao de PESSOA + API fora do ar: devolve o user do cookie (sem foto), nunca erro', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('conexão recusada'));
    const user = {
      id: 'user-1',
      email: 'maria@empresa.com',
      role: 'manager',
      mustChangePassword: false,
      name: 'Maria',
    };
    const cookie = cookieFor({
      tenantId: 'tenant-1',
      accessToken: 'acc-1',
      refreshToken: 'ref-1',
      user,
    });
    const req = createFakeReq({ method: 'GET', cookies: { [SESSION_COOKIE_NAME]: cookie } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ tenantId: 'tenant-1', user });
  });
});

/**
 * Access token FALSO que `getAccessTokenExpiration` consegue decodificar
 * (3 segmentos, payload JSON com `exp`) — sem isso, `requireSession`
 * considera o token "malformado" e dispara um refresh proativo (ver
 * `needsRefresh`), poluindo o mock de `fetch` com uma chamada extra que
 * nada tem a ver com o que este teste quer provar.
 */
function fakeAccessToken(expiresInSeconds = 900): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds }),
  ).toString('base64url');
  return `header.${payload}.sig`;
}

// Reorganização Perfil/Configurações (2026-08-27) — edição do próprio nome/foto.
describe('PATCH /api/auth/me', () => {
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
    const match = (res._headers['Set-Cookie'] as string).match(
      new RegExp(`^${SESSION_COOKIE_NAME}=([^;]*)`),
    );
    return match![1];
  }

  const USER = {
    id: 'user-1',
    email: 'maria@empresa.com',
    role: 'manager',
    mustChangePassword: false,
  };

  it('sem sessao: 401', async () => {
    const req = createFakeReq({ method: 'PATCH', cookies: {}, body: { name: 'Maria' } });
    const res = createFakeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('sessao de MAQUINA (sem user): 403 user_session_required', async () => {
    const cookie = cookieFor({ tenantId: 'tenant-1', apiKey: 'chave-1' });
    const req = createFakeReq({
      method: 'PATCH',
      cookies: { [SESSION_COOKIE_NAME]: cookie },
      body: { name: 'Maria' },
    });
    const res = createFakeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('corpo vazio: 400, sem chamar a API', async () => {
    const cookie = cookieFor({
      tenantId: 'tenant-1',
      accessToken: fakeAccessToken(),
      refreshToken: 'ref-1',
      user: USER,
    });
    const req = createFakeReq({
      method: 'PATCH',
      cookies: { [SESSION_COOKIE_NAME]: cookie },
      body: {},
    });
    const res = createFakeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sucesso: repassa para a API com Bearer, regrava o cookie e devolve o user atualizado', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ user: { ...USER, name: 'Maria Silva' } }),
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
      body: { name: 'Maria Silva' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(fetch).toHaveBeenCalledWith(
      new URL('/api/tenants/tenant-1/auth/me', 'http://api-de-teste:4000'),
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ Authorization: `Bearer ${accessToken}` }),
      }),
    );
    expect(res._headers['Set-Cookie']).toMatch(/wa_dashboard_session=/);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      user: { ...USER, name: 'Maria Silva' },
    });
  });

  it('API 401: repassa 401', async () => {
    (fetch as jest.Mock).mockResolvedValue({ status: 401, ok: false });
    const cookie = cookieFor({
      tenantId: 'tenant-1',
      accessToken: fakeAccessToken(),
      refreshToken: 'ref-1',
      user: USER,
    });
    const req = createFakeReq({
      method: 'PATCH',
      cookies: { [SESSION_COOKIE_NAME]: cookie },
      body: { name: 'Maria Silva' },
    });
    const res = createFakeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
