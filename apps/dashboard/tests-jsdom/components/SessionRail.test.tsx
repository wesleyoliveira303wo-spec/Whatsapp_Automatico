/**
 * Redesign 2026-08-05 (R2) — teste do `SessionRail` (sucessor do
 * `SessionSidebar`, agora um rail vertical só de ícones).
 *
 * Reorganização Perfil/Configurações (2026-08-27, ver DECISIONS.md #106) —
 * o círculo do topo deixou de mostrar a foto do WhatsApp conectado (não
 * depende mais de `useSessionDetail`) e virou o avatar do USUÁRIO logado,
 * com link para o Workspace (`/`); a engrenagem deixou de abrir um popover
 * (`AccountMenu`, removido) e virou um link direto para `/settings`.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionRail from '../../components/SessionRail';
import * as useMeModule from '../../hooks/useMe';
import * as useWaitingForHumanModule from '../../hooks/useWaitingForHuman';
import * as useSessionDetailModule from '../../hooks/useSessionDetail';

let mockAsPath = '/sessions/vendas';
jest.mock('next/router', () => ({
  useRouter: () => ({ asPath: mockAsPath }),
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
    mockAsPath = '/sessions/vendas';
  });

  it('mostra Conversas, Pipeline e Configurações para qualquer cargo', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'operator' } });
    render(<SessionRail sessionName="vendas" />);
    expect(screen.getByLabelText('Conversas')).toBeInTheDocument();
    expect(screen.getByLabelText('Pipeline')).toBeInTheDocument();
    expect(screen.getByLabelText('Configurações')).toBeInTheDocument();
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
    expect(screen.getByLabelText('Configurações')).toBeInTheDocument();
  });

  it('mostra o badge de aguardando quando há contagem para esta sessão', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'owner' } });
    mockUseWaitingForHuman.mockReturnValue({ count: 3, countBySession: { vendas: 3, suporte: 1 } });
    render(<SessionRail sessionName="vendas" />);
    expect(screen.getByTitle('3 conversa(s) aguardando atendimento humano')).toBeInTheDocument();
  });

  /**
   * 3ª rodada (2026-08-27, decisão do fundador): o círculo do topo é a
   * identidade da SESSÃO (foto do WhatsApp conectado) e leva aos DADOS dela
   * — não ao Workspace, e não à identidade da pessoa (que vive em
   * Configurações → Perfil).
   */
  it('o avatar do topo leva aos dados DESTA sessão (aba WhatsApps já aberta nela)', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'operator' } });
    render(<SessionRail sessionName="vendas" />);
    const link = screen.getByLabelText('vendas — dados desta conexão');
    expect(link).toHaveAttribute(
      'href',
      '/sessions/vendas/settings/whatsapps?session=vendas',
    );
  });

  it('o avatar do topo mostra a foto do WhatsApp da sessão quando há phoneNumber', () => {
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
    // Sem foto cacheada (jsdom, sem rede) cai no fallback de iniciais do
    // ContactAvatar — o que importa é NÃO ser a logo estática da marca
    // (que só aparece antes de o número ser conhecido).
    expect(screen.queryByRole('img', { name: 'Francis' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Conectado' })).toBeInTheDocument();
  });

  it('sem phoneNumber ainda conhecido: cai na logo da marca, nunca um círculo vazio', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'operator' } });
    render(<SessionRail sessionName="vendas" />);
    expect(screen.getByRole('img', { name: 'Francis' })).toBeInTheDocument();
  });

  /**
   * 3ª rodada (2026-08-27): a engrenagem aponta para as Configurações DA
   * SESSÃO (`/sessions/:s/settings`), não para `/settings` solto — é o que
   * mantém o rail lateral visível ao abrir Configurações (o fundador
   * reportou que perder o menu quebrava a navegação).
   */
  it('a engrenagem leva para as Configurações DA SESSÃO, aba Perfil (pedido explícito do fundador)', () => {
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'operator' } });
    render(<SessionRail sessionName="vendas" />);
    const link = screen.getByLabelText('Configurações');
    expect(link).toHaveAttribute('href', '/sessions/vendas/settings');
  });

  it('na tela de Configurações, a engrenagem fica destacada (verde) como os demais destinos', () => {
    mockAsPath = '/sessions/vendas/settings';
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'operator' } });
    render(<SessionRail sessionName="vendas" />);
    expect(screen.getByLabelText('Configurações').className).toContain('text-primary');
  });

  it('fora de Configurações, a engrenagem fica no tom neutro', () => {
    mockAsPath = '/sessions/vendas/conversations';
    mockUseMe.mockReturnValue({ user: { email: 'a@b.com', role: 'operator' } });
    render(<SessionRail sessionName="vendas" />);
    expect(screen.getByLabelText('Configurações').className).toContain('text-muted-foreground');
  });
});
