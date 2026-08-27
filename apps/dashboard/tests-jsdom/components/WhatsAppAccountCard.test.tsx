/**
 * Milestone 6, Bloco M6G — teste do `WhatsAppAccountCard` (card do dashboard
 * de WhatsApps, que substituiu o antigo `SessionListItem`).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WhatsAppAccountCard from '../../components/WhatsAppAccountCard';
import type { WhatsAppSessionSummary } from '../../lib/clientApi';

function buildSession(overrides: Partial<WhatsAppSessionSummary> = {}): WhatsAppSessionSummary {
  return {
    id: 's1',
    tenantId: 't1',
    sessionName: 'vendas',
    provider: 'baileys',
    status: 'connected',
    phoneNumber: '5511999999999',
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    lastSeen: '2026-07-24T09:00:00.000Z',
    ...overrides,
  };
}

describe('WhatsAppAccountCard (Milestone 6, Bloco M6G)', () => {
  it('renderiza nome, telefone e link para o detalhe', () => {
    render(<WhatsAppAccountCard session={buildSession()} />);
    expect(screen.getByText('vendas')).toBeInTheDocument();
    expect(screen.getByText('5511999999999')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /entrar em vendas/i })).toHaveAttribute(
      'href',
      '/sessions/vendas',
    );
  });

  it('mostra "Número ainda não vinculado" quando não há telefone', () => {
    render(<WhatsAppAccountCard session={buildSession({ phoneNumber: undefined })} />);
    expect(screen.getByText('Número ainda não vinculado')).toBeInTheDocument();
  });

  it('exibe a última atividade', () => {
    render(<WhatsAppAccountCard session={buildSession()} />);
    expect(screen.getByText(/Última atividade:/)).toBeInTheDocument();
  });

  it('não mostra badge de aguardando quando waitingCount é 0 ou ausente', () => {
    render(<WhatsAppAccountCard session={buildSession()} />);
    expect(screen.queryByTitle(/aguardando atendimento humano/)).not.toBeInTheDocument();
  });

  it('mostra badge de aguardando quando waitingCount > 0 (Milestone 6, Bloco M6H-1)', () => {
    render(<WhatsAppAccountCard session={buildSession()} waitingCount={2} />);
    expect(screen.getByTitle('2 conversa(s) aguardando atendimento humano')).toBeInTheDocument();
  });

  it('mostra a bolinha de status (verde quando conectado) ao lado do nome (2026-07-25)', () => {
    render(<WhatsAppAccountCard session={buildSession({ status: 'connected' })} />);
    expect(screen.getByRole('status', { name: 'Conectado' })).toBeInTheDocument();
  });

  it('mostra a bolinha cinza quando desconectado', () => {
    render(<WhatsAppAccountCard session={buildSession({ status: 'disconnected' })} />);
    expect(screen.getByRole('status', { name: 'Desconectado' })).toBeInTheDocument();
  });

  it('correção 2026-08-07 (2ª rodada): mostra a foto de perfil (ContactAvatar) quando há phoneNumber, não o ícone genérico', () => {
    const { container } = render(<WhatsAppAccountCard session={buildSession()} />);
    expect(container.querySelector('svg.lucide-smartphone')).not.toBeInTheDocument();
  });

  it('mantém o ícone genérico de celular quando não há phoneNumber', () => {
    const { container } = render(
      <WhatsAppAccountCard session={buildSession({ phoneNumber: undefined })} />,
    );
    expect(container.querySelector('svg.lucide-smartphone')).toBeInTheDocument();
  });

  /**
   * CORREÇÃO 2026-08-27 (pedido do fundador): "Gerenciar" era texto
   * sublinhado revelado só no hover, dentro do MESMO link que o card
   * inteiro — parecia clicável mas não tinha cara de botão, e um `<a>`
   * dentro de outro `<a>` seria HTML inválido. Agora são DOIS alvos de
   * clique DISTINTOS (nunca aninhados): a área de cima entra na sessão; o
   * botão "Gerenciar" (sempre visível, com cara de botão de verdade — borda,
   * fundo, padding) leva à descrição desta conexão.
   */
  it('"Gerenciar" é um botão de verdade, sempre visível (não depende de hover), que leva à descrição da sessão', () => {
    render(<WhatsAppAccountCard session={buildSession()} />);
    const manageLink = screen.getByRole('link', { name: /gerenciar/i });
    expect(manageLink).toHaveAttribute(
      'href',
      '/sessions/vendas/settings?tab=whatsapps&session=vendas',
    );
    // "Cara de botão": renderizado via `Button asChild` — tem as classes de
    // botão (borda), não é um texto solto com opacidade condicionada a hover.
    expect(manageLink.className).toContain('border');
    expect(manageLink.className).not.toContain('opacity-0');
  });

  it('os dois links do card são distintos e nunca aninhados (HTML válido)', () => {
    render(<WhatsAppAccountCard session={buildSession()} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    // Nenhum link é ancestral do outro.
    expect(links[0].contains(links[1])).toBe(false);
    expect(links[1].contains(links[0])).toBe(false);
  });
});
