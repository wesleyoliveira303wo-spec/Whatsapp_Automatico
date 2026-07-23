import handler from '../../../../pages/api/auth/me';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../../../lib/dashboardSession';
import { createFakeReq, createFakeRes } from '../../../testDoubles';

describe('GET /api/auth/me (Milestone 5, Bloco M5F-2)', () => {
  const originalSecret = process.env.DASHBOARD_SESSION_SECRET;

  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 11).toString('base64');
  });

  afterAll(() => {
    process.env.DASHBOARD_SESSION_SECRET = originalSecret;
  });

  function cookieFor(session: Parameters<typeof setSessionCookie>[1]): string {
    const res = createFakeRes();
    setSessionCookie(res, session);
    const match = (res._headers['Set-Cookie'] as string).match(new RegExp(`^${SESSION_COOKIE_NAME}=([^;]*)`));
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

  it('sessao de PESSOA: devolve o user e NUNCA os tokens', () => {
    const user = { id: 'user-1', email: 'maria@empresa.com', role: 'manager', mustChangePassword: false };
    const cookie = cookieFor({ tenantId: 'tenant-1', accessToken: 'acc-1', refreshToken: 'ref-1', user });
    const req = createFakeReq({ method: 'GET', cookies: { [SESSION_COOKIE_NAME]: cookie } });
    const res = createFakeRes();

    handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ tenantId: 'tenant-1', user });
    const body = JSON.stringify((res.json as jest.Mock).mock.calls[0][0]);
    expect(body).not.toContain('acc-1');
    expect(body).not.toContain('ref-1');
  });
});
