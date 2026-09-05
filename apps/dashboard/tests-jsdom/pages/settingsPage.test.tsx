import type { GetServerSidePropsContext } from 'next';
import { getServerSideProps } from '../../pages/settings/[[...section]]';
import { resolveSectionFromQuery } from '../../pages/sessions/[sessionName]/settings/[[...section]]';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../lib/dashboardSession';

/**
 * Reestruturação de Configurações, Fase 3 (2026-08-27, ver
 * `CONFIGURACOES_REDESIGN_PLAN.md`): a barra de abas com estado em
 * `useState` virou SEÇÕES com URL própria. Estes testes travam as duas
 * garantias que a auditoria pediu:
 *
 * - **deep-link**: a seção vem da URL, sobrevive a F5 e é favoritável;
 * - **gate no servidor**: uma URL que o papel não alcança nunca renderiza —
 *   redireciona para a primeira seção visível (defesa em profundidade; a
 *   barreira real continua sendo a API).
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

describe('/settings/[[...section]] (getServerSideProps)', () => {
  const originalSecret = process.env.DASHBOARD_SESSION_SECRET;

  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 7).toString('base64');
  });

  afterAll(() => {
    process.env.DASHBOARD_SESSION_SECRET = originalSecret;
  });

  function cookieFor(session: Parameters<typeof setSessionCookie>[1]): string {
    const headers: Record<string, string | string[]> = {};
    setSessionCookie(
      { setHeader: (n: string, v: string | string[]) => (headers[n] = v) } as never,
      session,
    );
    return sessionCookieFrom(headers);
  }

  function contextFor(
    session: Parameters<typeof setSessionCookie>[1],
    params: Record<string, unknown> = {},
    query: Record<string, string> = {},
  ): GetServerSidePropsContext {
    return {
      req: { cookies: { [SESSION_COOKIE_NAME]: cookieFor(session) } },
      params,
      query,
    } as unknown as GetServerSidePropsContext;
  }

  const userSession = (role: string) => ({
    tenantId: 'tenant-1',
    accessToken: 'acc-1',
    refreshToken: 'ref-1',
    user: { id: 'u1', email: 'a@b.com', role, mustChangePassword: false },
  });

  it('URL sem seção: normaliza para a primeira seção visível', async () => {
    const result = await getServerSideProps(contextFor(userSession('owner')));
    expect(result).toEqual({
      redirect: { destination: '/settings/atendimento', permanent: false },
    });
  });

  it('deep-link: a seção pedida na URL é a que renderiza (sobrevive a F5)', async () => {
    const result = await getServerSideProps(
      contextFor(userSession('owner'), { section: ['equipe'] }),
    );
    expect(result).toEqual({ props: { role: 'owner', section: 'equipe' } });
  });

  it('GATE: operator pedindo /settings/equipe é redirecionado — a seção nunca renderiza', async () => {
    const result = await getServerSideProps(
      contextFor(userSession('operator'), { section: ['equipe'] }),
    );
    expect(result).toEqual({
      redirect: { destination: '/settings/atendimento', permanent: false },
    });
  });

  it('GATE: só owner alcança /settings/seguranca', async () => {
    const asOwner = await getServerSideProps(
      contextFor(userSession('owner'), { section: ['seguranca'] }),
    );
    expect(asOwner).toEqual({ props: { role: 'owner', section: 'seguranca' } });

    const asAdmin = await getServerSideProps(
      contextFor(userSession('administrator'), { section: ['seguranca'] }),
    );
    expect(asAdmin).toEqual({
      redirect: { destination: '/settings/atendimento', permanent: false },
    });
  });

  it('manager alcança auditoria; operator não', async () => {
    const asManager = await getServerSideProps(
      contextFor(userSession('manager'), { section: ['auditoria'] }),
    );
    expect(asManager).toEqual({ props: { role: 'manager', section: 'auditoria' } });

    const asOperator = await getServerSideProps(
      contextFor(userSession('operator'), { section: ['auditoria'] }),
    );
    expect(asOperator).toEqual({
      redirect: { destination: '/settings/atendimento', permanent: false },
    });
  });

  it('seção inexistente na URL: cai na primeira visível, sem 500', async () => {
    const result = await getServerSideProps(
      contextFor(userSession('owner'), { section: ['inventada'] }),
    );
    expect(result).toEqual({
      redirect: { destination: '/settings/atendimento', permanent: false },
    });
  });

  it('sem sessão: redireciona para /login', async () => {
    const result = await getServerSideProps({
      req: { cookies: {} },
      params: {},
      query: {},
    } as unknown as GetServerSidePropsContext);
    expect(result).toEqual({ redirect: { destination: '/login', permanent: false } });
  });
});

describe('resolveSectionFromQuery — compatibilidade com o `?tab=` antigo', () => {
  it('mapeia os `?tab=` da barra de abas antiga para as seções novas', () => {
    expect(resolveSectionFromQuery(undefined, 'team', 'owner')).toBe('equipe');
    expect(resolveSectionFromQuery(undefined, 'audit', 'owner')).toBe('auditoria');
    expect(resolveSectionFromQuery(undefined, 'whatsapps', 'owner')).toBe('whatsapps');
  });

  it('`?tab=profile`/`?tab=company` (Perfil e Dados da empresa saíram de Configurações) caem na primeira seção visível', () => {
    expect(resolveSectionFromQuery(undefined, 'profile', 'owner')).toBe('atendimento');
    expect(resolveSectionFromQuery(undefined, 'company', 'owner')).toBe('atendimento');
  });

  it('a seção da URL tem precedência sobre o `?tab=` legado', () => {
    expect(resolveSectionFromQuery(['auditoria'], 'team', 'owner')).toBe('auditoria');
  });

  it('`?tab=` legado também respeita o gate de papel', () => {
    expect(resolveSectionFromQuery(undefined, 'team', 'operator')).toBe('atendimento');
  });
});
