import indexHandler from '../../../../pages/api/billing';
import checkoutHandler from '../../../../pages/api/billing/checkout';
import portalHandler from '../../../../pages/api/billing/portal';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../../../lib/dashboardSession';
import { createFakeReq, createFakeRes, sessionCookieValue } from '../../../testDoubles';

/** Token decodificável para `requireSession` não disparar refresh proativo. */
function fakeAccessToken(expiresInSeconds = 900): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds }),
  ).toString('base64url');
  return `header.${payload}.sig`;
}

/** B5, etapa 2 — o BFF da cobrança só repassa; quem decide é a API. */
describe('/api/billing', () => {
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

  const accessToken = fakeAccessToken();

  function ownerCookie(): string {
    const res = createFakeRes();
    setSessionCookie(res, {
      tenantId: 'tenant-1',
      accessToken,
      refreshToken: 'ref-1',
      user: { id: 'u1', email: 'dono@loja.com', role: 'owner', mustChangePassword: false },
    });
    return sessionCookieValue(res);
  }

  function apiReplies(status: number, body: unknown): void {
    (fetch as jest.Mock).mockResolvedValue({
      status,
      ok: status < 400,
      text: async () => JSON.stringify(body),
    });
  }

  it('sem sessão: 401', async () => {
    const res = createFakeRes();
    await indexHandler(createFakeReq({ method: 'GET', cookies: {} }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('GET repassa para /api/tenants/:tenantId/billing', async () => {
    apiReplies(200, { billing: { plan: 'free' } });
    const res = createFakeRes();

    await indexHandler(
      createFakeReq({ method: 'GET', cookies: { [SESSION_COOKIE_NAME]: ownerCookie() } }),
      res,
    );

    expect(fetch).toHaveBeenCalledWith(
      new URL('/api/tenants/tenant-1/billing', 'http://api-de-teste:4000'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${accessToken}` }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ billing: { plan: 'free' } });
  });

  it('checkout com plano válido: repassa e devolve a URL', async () => {
    apiReplies(200, { url: 'https://checkout.stripe.com/x' });
    const res = createFakeRes();

    await checkoutHandler(
      createFakeReq({
        method: 'POST',
        cookies: { [SESSION_COOKIE_NAME]: ownerCookie() },
        body: { plan: 'pro' },
      }),
      res,
    );

    expect(fetch).toHaveBeenCalledWith(
      new URL('/api/tenants/tenant-1/billing/checkout', 'http://api-de-teste:4000'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ plan: 'pro' }) }),
    );
    expect(res.json).toHaveBeenCalledWith({ url: 'https://checkout.stripe.com/x' });
  });

  it.each([{ plan: 'free' }, { plan: 'gold' }, {}])(
    'checkout com plano inválido %j: 400 sem chamar a API',
    async (body) => {
      const res = createFakeRes();
      await checkoutHandler(
        createFakeReq({ method: 'POST', cookies: { [SESSION_COOKIE_NAME]: ownerCookie() }, body }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('portal: repassa o 409 da API tal e qual', async () => {
    apiReplies(409, { error: 'no_billing_account', message: 'Você ainda não tem uma assinatura.' });
    const res = createFakeRes();

    await portalHandler(
      createFakeReq({ method: 'POST', cookies: { [SESSION_COOKIE_NAME]: ownerCookie() } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'no_billing_account',
      message: 'Você ainda não tem uma assinatura.',
    });
  });

  it('método errado: 405', async () => {
    const res = createFakeRes();
    await portalHandler(
      createFakeReq({ method: 'GET', cookies: { [SESSION_COOKIE_NAME]: ownerCookie() } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
