/**
 * M2, Fase 4 (UI-4) — teste do `HistoryList`: histórico recente de
 * transições de status de uma sessão. Gap pré-existente fechado nesta
 * rodada (Onda 1 do redesign, 2026-08-22) — o componente nunca teve teste
 * jsdom dedicado, e ganhou um retry de verdade (antes o erro não tinha
 * nenhuma ação — `ErrorState` sem `onRetry` só mostraria a mensagem).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import HistoryList from '../../components/HistoryList';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchHistory: jest.fn(),
}));

function event(over: Partial<clientApi.WhatsAppSessionEvent> = {}): clientApi.WhatsAppSessionEvent {
  return {
    id: 'ev-1',
    tenantId: 'tenant-1',
    sessionName: 'vendas',
    status: 'connected',
    occurredAt: '2026-08-05T12:00:00.000Z',
    ...over,
  };
}

describe('HistoryList (M2, Fase 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carrega e lista os eventos ao montar', async () => {
    (clientApi.fetchHistory as jest.Mock).mockResolvedValue({ events: [event()] });

    render(<HistoryList sessionName="vendas" />);

    await waitFor(() => {
      expect(clientApi.fetchHistory).toHaveBeenCalledWith('vendas', 20);
    });
    expect(screen.getByText('Conectado')).toBeInTheDocument();
  });

  it('mostra mensagem de lista vazia quando não há eventos', async () => {
    (clientApi.fetchHistory as jest.Mock).mockResolvedValue({ events: [] });

    render(<HistoryList sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByText('Nenhum evento registrado ainda.')).toBeInTheDocument();
    });
  });

  it('mostra skeleton enquanto carrega', () => {
    (clientApi.fetchHistory as jest.Mock).mockReturnValue(new Promise(() => {}));

    const { container } = render(<HistoryList sessionName="vendas" />);

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  /**
   * Onda 1 do redesign (2026-08-22) — antes, uma falha aqui não tinha
   * NENHUMA ação de recuperação (só um `<p>` vermelho); a única saída era
   * recarregar a página inteira. Agora `ErrorState` tem um `onRetry` real
   * que refaz a mesma busca.
   */
  it('erro vira ErrorState com retry de verdade, que refaz a busca', async () => {
    (clientApi.fetchHistory as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    render(<HistoryList sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByText('Falha ao carregar o histórico.')).toBeInTheDocument();
    });

    (clientApi.fetchHistory as jest.Mock).mockResolvedValueOnce({ events: [event()] });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => {
      expect(clientApi.fetchHistory).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Conectado')).toBeInTheDocument();
  });
});
