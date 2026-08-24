/**
 * Redesign 2026-08-05 (R2) — teste do `SessionRail` (sucessor do
 * `SessionSidebar`, agora um rail vertical só de ícones). Mantido neste
 * arquivo (`SessionSidebar.test.tsx`) porque o ambiente não permite
 * renomear/apagar arquivos — o componente sob teste é importado
 * diretamente de `SessionRail.tsx`.
 *
 * Como o rail não tem mais rótulos visíveis (só ícone + `title`/
 * `aria-label`), as asserções usam `getByLabelText`/`getByTitle` em vez de
 * `getByText`. "Cérebro da IA"/"Respostas Rápidas"/"Equipe"/"Auditoria"
 * deixaram de ser itens do rail — viraram abas dentro de "IA"/"Configurações"
 * (cobertas por outros testes, não aqui).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionRail from '../../components/SessionRail';
import * as useMeModule from '../../hooks/useMe';
import * as useWaitingForHumanModule from '../../hooks/useWaitingForHuman';
import * as useSessionDetailModule from '../../hooks/useSessionDetail';

jest.mock('next/router', () => ({
  useRouter: () => ({ asPath: '/sessions/vendas' }),
}));

jest.mock('../../hooks/useMe');
jest.mock('../../hooks/useWaitingForHuman');
jest.mock('../../hooks/useSessionDetail');

const mockUseMe = useMeModule.useMe as jest.Mock;
const mockUseWaitingForHuman = useWaitingForHumanModule.useWaitingForHuman as jest.Mock;
const mockUseSessionDetail = useSessionDetailModule.useSessionDetail as jest.Mock;

describe('SessionRail (Redesign 2026-08-05, R2)', () => {
  beforeEach(() => {
    mockUseWaitingForHuman.mockReturnValue({ count: 0, countBySession: {} });
    mockUseSessionDetail.mockReturnValue({
      session: null,
      loading: true,
      errorMessage: null,
      connected: true,
    });
  });

  it('mostra Conversas, Pipeline e Configurações para qualquer cargo', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'operator' } });
    render(<SessionRail sessionName="vendas" />);
    expect(screen.getByLabelText('Conversas')).toBeInTheDocument();
    expect(screen.getByLabelText('Pipeline')).toBeInTheDocument();
    expect(screen.getByLabelText('Configurações e conta')).toBeInTheDocument();
  });

  // Reorganização Contatos/Campanhas (2026-08-17, 2ª rodada — pedido do
  // fundador): Campanhas volta a ter item próprio no rail, separado de
  // Contatos.
  it('mostra Campanhas para qualquer cargo, com link para a rota certa da sessão', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'operator' } });
    render(<SessionRail sessionName="vendas" />);
    const link = screen.getByLabelText('Campanhas');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/sessions/vendas/campaigns');
  });

  it('esconde Analytics e IA para cargo sem gestão', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'operator' } });
    render(<SessionRail sessionName="vendas" />);
    expect(screen.queryByLabelText('Analytics')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('IA')).not.toBeInTheDocument();
  });

  it('mostra Analytics e IA para owner', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'owner' } });
    render(<SessionRail sessionName="vendas" />);
    expect(screen.getByLabelText('Analytics')).toBeInTheDocument();
    expect(screen.getByLabelText('IA')).toBeInTheDocument();
  });

  it('Configurações continua visível mesmo sem gestão (o gate é POR ABA, dentro da página)', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'read_only' } });
    render(<SessionRail sessionName="vendas" />);
    expect(screen.getByLabelText('Configurações e conta')).toBeInTheDocument();
  });

  it('mostra o badge de aguardando quando há contagem para esta sessão', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'owner' } });
    mockUseWaitingForHuman.mockReturnValue({ count: 3, countBySession: { vendas: 3, suporte: 1 } });
    render(<SessionRail sessionName="vendas" />);
    expect(screen.getByTitle('3 conversa(s) aguardando atendimento humano')).toBeInTheDocument();
  });

  it('correção 2026-08-07 (2ª rodada): o ícone do topo NÃO é mais um link — "voltar ao Workspace" migrou para a marca do SessionHeader', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'operator' } });
    render(<SessionRail sessionName="vendas" />);
    expect(screen.queryByLabelText('Voltar para Todos os WhatsApps')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /voltar/i })).not.toBeInTheDocument();
  });

  it('mostra a bolinha de status quando useSessionDetail já resolveu (2026-07-25)', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'operator' } });
    mockUseSessionDetail.mockReturnValue({
      session: {
        id: 's1',
        tenantId: 't1',
        sessionName: 'vendas',
        provider: 'baileys',
        status: 'disconnected',
      },
      loading: false,
      errorMessage: null,
      connected: true,
    });
    render(<SessionRail sessionName="vendas" />);
    expect(screen.getByRole('status', { name: 'Desconectado' })).toBeInTheDocument();
  });

  it('correção 2026-08-07 (2ª rodada): mostra o avatar do contato quando a sessão tem phoneNumber conhecido', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'operator' } });
    mockUseSessionDetail.mockReturnValue({
      session: {
        id: 's1',
        tenantId: 't1',
        sessionName: 'vendas',
        provider: 'baileys',
        status: 'connected',
        phoneNumber: '5511999999999',
      },
      loading: false,
      errorMessage: null,
      connected: true,
    });
    render(<SessionRail sessionName="vendas" />);
    // Sem foto cacheada (jsdom, sem rede), cai no fallback de iniciais — o
    // que importa aqui é que o dado passado para o avatar é o número da
    // SESSÃO, não a logo estática da marca (que só aparece sem phoneNumber).
    expect(screen.queryByRole('img', { name: 'Francis' })).not.toBeInTheDocument();
  });

  it('não mostra a bolinha de status enquanto useSessionDetail ainda está carregando (session === null)', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'operator' } });
    mockUseSessionDetail.mockReturnValue({
      session: null,
      loading: true,
      errorMessage: null,
      connected: true,
    });
    render(<SessionRail sessionName="vendas" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
