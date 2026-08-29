import type { GetServerSidePropsContext } from 'next';
import { getServerSideProps } from '../../pages/index';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../lib/dashboardSession';

/**
 * `/` virou a LANDING PAGE pública (2026-08-29). O `getServerSideProps` só
 * desvia quem já está logado — visitante anônimo recebe a página (props),
 * NUNCA um redirect para `/login`. O Workspace, que respondia por `/`
 * antes, mudou para `/app` (ver `tests-jsdom/pages/appRedirect.test.tsx`).
 */
describe('/ (landing page)', () => {
  const originalSecret = process.env.DASHBOARD_SESSION_SECRET;

  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 3).toString('base64');
  });

  afterAll(() => {
    process.env.DASHBOARD_SESSION_SECRET = originalSecret;
  });

  function contextWithSession(): GetServerSidePropsContext {
    const headers: Record<string, string> = {};
    setSessionCookie({ setHeader: (n: string, v: string) => (headers[n] = v) } as never, {
      tenantId: 'tenant-1',
      apiKey: 'chave-1',
    });
    const cookie = headers['Set-Cookie'].match(
      new RegExp(`^${SESSION_COOKIE_NAME}=([^;]*)`),
    )![1];
    return {
      req: { cookies: { [SESSION_COOKIE_NAME]: cookie } },
      query: {},
    } as unknown as GetServerSidePropsContext;
  }

  it('visitante anônimo: renderiza a landing (props), nunca redireciona para /login', async () => {
    const result = await getServerSideProps({
      req: { cookies: {} },
      query: {},
    } as unknown as GetServerSidePropsContext);

    expect('redirect' in result).toBe(false);
    expect(result).toHaveProperty('props.currentYear');
    expect(typeof (result as { props: { currentYear: number } }).props.currentYear).toBe('number');
  });

  it('visitante logado: redireciona para o app (/app)', async () => {
    const result = await getServerSideProps(contextWithSession());

    expect(result).toEqual({ redirect: { destination: '/app', permanent: false } });
  });
});
