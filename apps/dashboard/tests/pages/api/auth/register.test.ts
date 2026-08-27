import handler from '../../../../pages/api/auth/register';
import { createFakeReq, createFakeRes } from '../../../testDoubles';

/** Fase Auth/Registro (2026-08-26) — POST /api/auth/register (BFF). */
describe('POST /api/auth/register', () => {
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalSecret = process.env.DASHBOARD_SESSION_SECRET;

  beforeEach(() => {
    process.env.API_BASE_URL = 'http://api-de-teste:4000';
    process.env.DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 5).toString('base64');
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env.API_BASE_URL = originalApiBaseUrl;
    process.env.DASHBOARD_SESSION_SECRET = originalSecret;
  });

  it('responde 405 para métodos diferentes de POST', async () => {
    const req = createFakeReq({ method: 'GET' });
    const res = createFakeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('responde 400 quando faltar algum campo obrigatorio', async () => {
    const req = createFakeReq({ method: 'POST', body: { name: 'Maria' } });
    const res = createFakeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sucesso: repassa para /api/auth/register da API, grava cookie e devolve { tenantId, user } SEM tokens', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({
        accessToken: 'acc-1',
        refreshToken: 'ref-1',
        tenantId: 'tenant-1',
        user: { id: 'user-1', email: 'maria@empresa.com', role: 'owner' },
      }),
    });
    const req = createFakeReq({
      method: 'POST',
      body: {
        name: 'Maria',
        email: 'maria@empresa.com',
        password: 'senha-forte-123',
        companyName: 'Empresa da Maria',
      },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(fetch).toHaveBeenCalledWith(
      new URL('/api/auth/register', 'http://api-de-teste:4000'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res._headers['Set-Cookie']).toMatch(/wa_dashboard_session=/);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      user: {
        id: 'user-1',
        email: 'maria@empresa.com',
        role: 'owner',
        mustChangePassword: false,
      },
    });
    const responseBody = JSON.stringify((res.json as jest.Mock).mock.calls[0][0]);
    expect(responseBody).not.toContain('acc-1');
    expect(responseBody).not.toContain('ref-1');
  });

  it('e-mail ja em uso: API responde 409 -> 409 email_in_use, sem cookie', async () => {
    (fetch as jest.Mock).mockResolvedValue({ status: 409, ok: false });
    const req = createFakeReq({
      method: 'POST',
      body: {
        name: 'Maria',
        email: 'ja-existe@empresa.com',
        password: 'senha-forte-123',
        companyName: 'Empresa',
      },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'email_in_use', message: expect.any(String) });
    expect(res._headers['Set-Cookie']).toBeUndefined();
  });

  it('senha fraca: API responde 422 -> 422', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      status: 422,
      ok: false,
      json: async () => ({ error: 'weak_password' }),
    });
    const req = createFakeReq({
      method: 'POST',
      body: { name: 'Maria', email: 'a@b.com', password: '123', companyName: 'Empresa' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
  });
});
