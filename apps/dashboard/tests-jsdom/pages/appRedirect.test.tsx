import type { GetServerSidePropsContext } from 'next';
import { getServerSideProps } from '../../pages/app';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../lib/dashboardSession';
import * as apiClient from '../../lib/apiClient';

jest.mock('../../lib/apiClient', () => ({
  ...jest.requireActual('../../lib/apiClient'),
  callApi: jest.fn(),
}));

const mockCallApi = apiClient.callApi as jest.Mock;

/**
 * `/app` — o Workspace. Esta lógica vivia em `pages/index.tsx` até
 * 2026-08-29, quando `/` virou a landing page. Comportamento idêntico ao de
 * antes, só a rota mudou (ver `lib/routes.ts`, `APP_HOME`).
 */
describe('/app (Workspace)', () => {
  const originalSecret = process.env.DASHBOARD_SESSION_SECRET;

  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = Buffer.alloc(32, 3).toString('base64');
    mockCallApi.mockReset();
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

  it('com sessões: redireciona para a LISTA de WhatsApps', async () => {
    mockCallApi.mockResolvedValue({
      status: 200,
      body: { sessions: [{ sessionName: 'Whatsapp Sites' }, { sessionName: 'suporte' }] },
    });

    const result = await getServerSideProps(contextWithSession());

    expect(result).toEqual({
      redirect: {
        destination: '/sessions/Whatsapp%20Sites/settings/whatsapps',
        permanent: false,
      },
    });
  });

  it('SEM nenhuma sessão: renderiza a tela (onde se conecta a primeira)', async () => {
    mockCallApi.mockResolvedValue({ status: 200, body: { sessions: [] } });

    const result = await getServerSideProps(contextWithSession());

    expect(result).toEqual({ props: { tenantId: 'tenant-1' } });
  });

  it('API falhando: falha ABERTA, renderiza a tela', async () => {
    mockCallApi.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await getServerSideProps(contextWithSession());

    expect(result).toEqual({ props: { tenantId: 'tenant-1' } });
  });

  it('sem sessão de login: manda para /login', async () => {
    const result = await getServerSideProps({
      req: { cookies: {} },
      query: {},
    } as unknown as GetServerSidePropsContext);

    expect(result).toEqual({ redirect: { destination: '/login', permanent: false } });
  });
});
