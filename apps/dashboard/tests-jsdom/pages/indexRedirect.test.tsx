import type { GetServerSidePropsContext } from 'next';
import { getServerSideProps } from '../../pages/index';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../lib/dashboardSession';

/**
 * `/` virou a LANDING PAGE pública (2026-08-29). O `getServerSideProps` só
 * desvia quem já está logado — visitante anônimo recebe a página (props),
 * NUNCA um redirect para `/login`. O Workspace, que respondia por `/`
 * antes, mudou para `/app` (ver `tests-jsdom/pages/appRedirect.test.tsx`).
 */
/**
 * Bloco B1 (token CSRF): `setSessionCookie` passou a gravar DOIS cookies (a
 * sessão cifrada e o token legível), então `Set-Cookie` é um ARRAY. Este
 * helper escolhe o cookie de sessão em vez de assumir uma string única.
 */
function sessionCookieFrom(headers: Record<string, string | string[]>): string {
  const raw = headers['Set-Cookie'];
  const all = Array.isArray(raw) ? raw : [raw];
  const header = all.find((cookie) => cookie?.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!header) throw new Error('Set-Cookie não contém o cookie de sessão');
  return header.slice(`${SESSION_COOKIE_NAME}=`.length).split(';')[0];
}

describe('/ (landing page)', () => {
  const originalSecret = process.env.DASHBOARD_SESSION_SECRET;

  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 3).toString('base64');
  });

  afterAll(() => {
    process.env.DASHBOARD_SESSION_SECRET = originalSecret;
  });

  function contextWithSession(): GetServerSidePropsContext {
    const headers: Record<string, string | string[]> = {};
    setSessionCookie(
      { setHeader: (n: string, v: string | string[]) => (headers[n] = v) } as never,
      { tenantId: 'tenant-1', apiKey: 'chave-1' },
    );
    const cookie = sessionCookieFrom(headers);
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
