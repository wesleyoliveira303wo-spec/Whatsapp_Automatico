import type { GetServerSidePropsContext } from 'next';
import { getServerSideProps } from '../../pages/index';
import { setSessionCookie, SESSION_COOKIE_NAME } from '../../lib/dashboardSession';
import * as apiClient from '../../lib/apiClient';

jest.mock('../../lib/apiClient', () => ({
  ...jest.requireActual('../../lib/apiClient'),
  callApi: jest.fn(),
}));

const mockCallApi = apiClient.callApi as jest.Mock;

/**
 * MESCLAGEM 2026-08-27 (4ª/5ª rodadas) — `/` deixou de ser um destino
 * quando já existe uma sessão: manda para a LISTA de WhatsApps dentro de
 * Configurações (com o rail lateral), eliminando a tela redundante que
 * confundia. Só renderiza quando o tenant não tem NENHUMA sessão (onde se
 * conecta a primeira).
 */
describe('/ (Workspace)', () => {
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

  it('com sessões: redireciona para a LISTA de WhatsApps (tela de entrada pós-login)', async () => {
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

  it('a lista (sem ?session=) é o destino — nunca a descrição de uma sessão específica', async () => {
    mockCallApi.mockResolvedValue({
      status: 200,
      body: { sessions: [{ sessionName: 'Whatsapp Sites' }] },
    });

    const result = await getServerSideProps(contextWithSession());

    expect(JSON.stringify(result)).not.toContain('session=');
  });

  it('SEM nenhuma sessão: renderiza a tela (é onde se conecta a primeira)', async () => {
    mockCallApi.mockResolvedValue({ status: 200, body: { sessions: [] } });

    const result = await getServerSideProps(contextWithSession());

    expect(result).toEqual({ props: { tenantId: 'tenant-1' } });
  });

  it('API falhando: falha ABERTA, renderiza a tela em vez de estourar', async () => {
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
