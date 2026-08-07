import handler from '../../../../pages/api/auth/login';
import { createFakeReq, createFakeRes } from '../../../testDoubles';

describe('POST /api/auth/login', () => {
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

  it('responde 400 quando tenantId/apiKey estão ausentes', async () => {
    const req = createFakeReq({ method: 'POST', body: { tenantId: '' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('valida a API key contra GET /whatsapp-sessions; se 200, grava o cookie e responde 200 { tenantId }', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => '{"sessions":[]}',
    });
    const req = createFakeReq({
      method: 'POST',
      body: { tenantId: 'tenant-1', apiKey: 'chave-valida' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(fetch).toHaveBeenCalledWith(
      new URL('/api/tenants/tenant-1/whatsapp-sessions', 'http://api-de-teste:4000'),
      { headers: { 'X-API-Key': 'chave-valida' } },
    );
    expect(res._headers['Set-Cookie']).toMatch(/wa_dashboard_session=/);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ tenantId: 'tenant-1' });
    // A API key NUNCA é devolvida no corpo da resposta.
    expect(JSON.stringify((res.json as jest.Mock).mock.calls[0][0])).not.toContain('chave-valida');
  });

  it('responde 401 invalid_credentials quando a API validar como 401/403, sem gravar cookie', async () => {
    (fetch as jest.Mock).mockResolvedValue({ status: 403, ok: false, text: async () => '' });
    const req = createFakeReq({
      method: 'POST',
      body: { tenantId: 'tenant-1', apiKey: 'chave-errada' },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_credentials' });
    expect(res._headers['Set-Cookie']).toBeUndefined();
  });

  it('responde 502 api_unreachable quando fetch lança (API fora do ar)', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    const req = createFakeReq({ method: 'POST', body: { tenantId: 'tenant-1', apiKey: 'chave' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: 'api_unreachable', message: 'ECONNREFUSED' });
  });

  // --- Milestone 5, Bloco M5F-1: modo PESSOA (email + senha) ---
  describe('modo pessoa (email + senha)', () => {
    const API_USER = {
      id: 'user-1',
      email: 'maria@empresa.com',
      role: 'operator',
      mustChangePassword: true,
    };

    it('login ok: repassa para /auth/login da API, grava cookie e devolve { tenantId, user } SEM tokens', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ accessToken: 'acc-1', refreshToken: 'ref-1', user: API_USER }),
      });
      const req = createFakeReq({
        method: 'POST',
        body: { tenantId: 'tenant-1', email: 'maria@empresa.com', password: 'senha-provisoria' },
      });
      const res = createFakeRes();

      await handler(req, res);

      expect(fetch).toHaveBeenCalledWith(
        new URL('/api/tenants/tenant-1/auth/login', 'http://api-de-teste:4000'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(res._headers['Set-Cookie']).toMatch(/wa_dashboard_session=/);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ tenantId: 'tenant-1', user: API_USER });
      // Tokens NUNCA saem no corpo — so dentro do cookie cifrado.
      const responseBody = JSON.stringify((res.json as jest.Mock).mock.calls[0][0]);
      expect(responseBody).not.toContain('acc-1');
      expect(responseBody).not.toContain('ref-1');
    });

    it('senha errada: API responde 401 -> 401 invalid_credentials, sem cookie', async () => {
      (fetch as jest.Mock).mockResolvedValue({ status: 401, ok: false, json: async () => ({}) });
      const req = createFakeReq({
        method: 'POST',
        body: { tenantId: 'tenant-1', email: 'maria@empresa.com', password: 'errada' },
      });
      const res = createFakeRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'invalid_credentials' });
      expect(res._headers['Set-Cookie']).toBeUndefined();
    });

    it('email sem password: 400 sem chamar a API', async () => {
      const req = createFakeReq({
        method: 'POST',
        body: { tenantId: 'tenant-1', email: 'maria@empresa.com' },
      });
      const res = createFakeRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
