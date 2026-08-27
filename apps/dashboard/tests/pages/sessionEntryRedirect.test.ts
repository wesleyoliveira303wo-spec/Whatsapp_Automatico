import type { GetServerSidePropsContext } from 'next';
import { getServerSideProps } from '../../pages/sessions/[sessionName]';

/**
 * TRAVA DE REGRESSÃO — achado real do fundador (2026-08-27): clicar num card
 * de sessão no Workspace parava nas CONFIGURAÇÕES, não no Dashboard da
 * sessão. Causa: esta rota redirecionava para `/sessions/:s/settings` (do
 * Redesign 2026-08-05), que por sua vez virou redirect para `/settings`
 * (nível tenant) na Reorganização Perfil/Configurações — a cadeia toda
 * cuspia o usuário fora do contexto da sessão, deixando Conversas/Pipeline/
 * Contatos inalcançáveis pela navegação normal.
 *
 * Este teste prova o destino CORRETO. Se alguém reapontar para `settings`
 * de novo, quebra aqui — não em produção.
 */
describe('/sessions/:sessionName (entrada da sessão)', () => {
  it('redireciona para o Dashboard da sessão (conversations), NUNCA para configurações', async () => {
    const result = await getServerSideProps({
      params: { sessionName: 'vendas' },
    } as unknown as GetServerSidePropsContext);

    expect(result).toEqual({
      redirect: { destination: '/sessions/vendas/conversations', permanent: false },
    });
    expect(JSON.stringify(result)).not.toContain('settings');
  });

  it('escapa nomes de sessão com caracteres especiais', async () => {
    const result = await getServerSideProps({
      params: { sessionName: 'vendas & suporte' },
    } as unknown as GetServerSidePropsContext);

    expect(result).toEqual({
      redirect: {
        destination: '/sessions/vendas%20%26%20suporte/conversations',
        permanent: false,
      },
    });
  });

  it('sem sessionName: cai no Workspace', async () => {
    const result = await getServerSideProps({
      params: {},
    } as unknown as GetServerSidePropsContext);

    expect(result).toEqual({ redirect: { destination: '/', permanent: false } });
  });
});
