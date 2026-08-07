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
    expect(screen.getByRole('link')).toHaveAttribute('href', '/sessions/vendas');
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
});
