import type { GetServerSidePropsContext } from 'next';
import { getServerSideProps } from '../../pages/settings';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../lib/dashboardSession';

/**
 * Reorganização Perfil/Configurações, 2ª rodada (2026-08-27) — "Perfil" é a
 * aba PADRÃO ao abrir pela engrenagem (pedido do fundador: a engrenagem abre
 * no que é da pessoa, não na administração do workspace), e cada aba mantém
 * seu gate de papel.
 *
 * Vive em `tests-jsdom` (não em `tests/`) só por causa do transform: este
 * projeto do Jest é o que converte TSX — `pages/settings.tsx` tem JSX, e
 * importá-lo do projeto `dashboard` (sem transform de TSX) falha com
 * "Unexpected token '<'".
 */
describe('/settings (getServerSideProps)', () => {
  const originalSecret = process.env.DASHBOARD_SESSION_SECRET;

  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 7).toString('base64');
  });

  afterAll(() => {
    process.env.DASHBOARD_SESSION_SECRET = originalSecret;
  });

  function cookieFor(session: Parameters<typeof setSessionCookie>[1]): string {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as never;
    setSessionCookie(res, session);
    return headers['Set-Cookie'].match(new RegExp(`^${SESSION_COOKIE_NAME}=([^;]*)`))![1];
  }

  function contextFor(
    session: Parameters<typeof setSessionCookie>[1],
    query: Record<string, string> = {},
  ): GetServerSidePropsContext {
    return {
      req: { cookies: { [SESSION_COOKIE_NAME]: cookieFor(session) } },
      query,
    } as unknown as GetServerSidePropsContext;
  }

  const userSession = (role: string) => ({
    tenantId: 'tenant-1',
    accessToken: 'acc-1',
    refreshToken: 'ref-1',
    user: { id: 'u1', email: 'a@b.com', role, mustChangePassword: false },
  });

  it('sessão de PESSOA sem ?tab: abre em "profile"', async () => {
    const result = await getServerSideProps(contextFor(userSession('owner')));
    expect(result).toEqual({ props: { role: 'owner', hasUser: true, initialTab: 'profile' } });
  });

  it('sessão de MÁQUINA (API key, sem pessoa): cai em "whatsapps"', async () => {
    const result = await getServerSideProps(
      contextFor({ tenantId: 'tenant-1', apiKey: 'chave-1' }),
    );
    expect(result).toEqual({ props: { role: null, hasUser: false, initialTab: 'whatsapps' } });
  });

  it('?tab=team com papel sem gestão: cai de volta em "profile"', async () => {
    const result = await getServerSideProps(contextFor(userSession('operator'), { tab: 'team' }));
    expect(result).toEqual({ props: { role: 'operator', hasUser: true, initialTab: 'profile' } });
  });

  it('?tab=team com owner: respeita a aba pedida', async () => {
    const result = await getServerSideProps(contextFor(userSession('owner'), { tab: 'team' }));
    expect(result).toEqual({ props: { role: 'owner', hasUser: true, initialTab: 'team' } });
  });

  it('?tab=company (aba extinta — virou seção de Perfil): cai em "profile"', async () => {
    const result = await getServerSideProps(contextFor(userSession('owner'), { tab: 'company' }));
    expect(result).toEqual({ props: { role: 'owner', hasUser: true, initialTab: 'profile' } });
  });

  it('sem sessão: redireciona para /login', async () => {
    const result = await getServerSideProps({
      req: { cookies: {} },
      query: {},
    } as unknown as GetServerSidePropsContext);
    expect(result).toEqual({ redirect: { destination: '/login', permanent: false } });
  });
});
