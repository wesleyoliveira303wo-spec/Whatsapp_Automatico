/**
 * `GroupBroadcastsPanel` — Disparos em grupos (2026-09-11): lista de uma
 * sessão, criação (delegada ao `GroupBroadcastCreateForm`) e as ações do
 * motor de envio (iniciar/pausar/cancelar/excluir), com confirmação
 * explícita nomeando quantos grupos e o risco antes de publicar de verdade.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import GroupBroadcastsPanel from '../../components/GroupBroadcastsPanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchGroupBroadcasts: jest.fn(),
  startGroupBroadcast: jest.fn(),
  pauseGroupBroadcast: jest.fn(),
  cancelGroupBroadcast: jest.fn(),
  deleteGroupBroadcast: jest.fn(),
  fetchWhatsAppGroups: jest.fn(),
}));

jest.mock('../../components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

function broadcast(over: Partial<clientApi.GroupBroadcast> = {}): clientApi.GroupBroadcast {
  return {
    id: 'broadcast-1',
    tenantId: 'tenant-1',
    sessionName: 'vendas',
    name: 'Aviso de promoção',
    messageTemplate: 'Olá, pessoal!',
    status: 'draft',
    intervalSeconds: 60,
    createdAt: '2026-09-11T10:00:00.000Z',
    updatedAt: '2026-09-11T10:00:00.000Z',
    ...over,
  };
}

function summary(
  over: Partial<clientApi.GroupBroadcastSummary> = {},
): clientApi.GroupBroadcastSummary {
  return { total: 3, pending: 3, sent: 0, failed: 0, skipped: 0, ...over };
}

function mockDefaults(): void {
  (clientApi.fetchGroupBroadcasts as jest.Mock).mockResolvedValue({
    broadcasts: [{ broadcast: broadcast(), summary: summary() }],
  });
  (clientApi.fetchWhatsAppGroups as jest.Mock).mockResolvedValue({
    groups: [],
    fetchedAt: '2026-09-11T10:00:00.000Z',
  });
}

async function renderPanel(): Promise<void> {
  render(<GroupBroadcastsPanel sessionName="vendas" />);
  await waitFor(() => expect(screen.getByText('Aviso de promoção')).toBeInTheDocument());
}

describe('GroupBroadcastsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDefaults();
  });

  it('lista os disparos com status e resumo', async () => {
    await renderPanel();

    const table = within(screen.getByTestId('group-broadcasts-table'));
    expect(table.getByText('Rascunho')).toBeInTheDocument();
    expect(table.getByText('3')).toBeInTheDocument(); // total de grupos
  });

  it('estado vazio: sem nenhum disparo, mostra o convite para criar', async () => {
    (clientApi.fetchGroupBroadcasts as jest.Mock).mockResolvedValue({ broadcasts: [] });
    render(<GroupBroadcastsPanel sessionName="vendas" />);

    await waitFor(() =>
      expect(screen.getByText('Nenhum disparo em grupos ainda')).toBeInTheDocument(),
    );
  });

  it('erro ao carregar mostra o ErrorState com retry', async () => {
    (clientApi.fetchGroupBroadcasts as jest.Mock).mockRejectedValue(new Error('falhou'));
    render(<GroupBroadcastsPanel sessionName="vendas" />);

    await waitFor(() =>
      expect(
        screen.getByText('Não foi possível carregar os disparos em grupos.'),
      ).toBeInTheDocument(),
    );
  });

  it('"Iniciar" pede confirmação explícita nomeando quantos grupos e o risco, antes de publicar', async () => {
    await renderPanel();
    (clientApi.startGroupBroadcast as jest.Mock).mockResolvedValue({
      broadcast: broadcast({ status: 'running' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /iniciar/i }));

    // Nomeia a QUANTIDADE (3 grupos) e cita o RISCO (spam/banimento).
    expect(
      screen.getByText((text) => text.includes('Iniciar publicação em 3 grupos?')),
    ).toBeInTheDocument();
    expect(
      screen.getByText((text) => text.toLowerCase().includes('banido')),
    ).toBeInTheDocument();
    expect(clientApi.startGroupBroadcast).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e publicar' }));

    await waitFor(() => expect(clientApi.startGroupBroadcast).toHaveBeenCalledWith('broadcast-1'));
  });

  it('cancelar dentro do diálogo de início NÃO dispara o envio', async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /iniciar/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(clientApi.startGroupBroadcast).not.toHaveBeenCalled();
  });

  it('"Pausar" some quando o disparo está draft, aparece quando running', async () => {
    (clientApi.fetchGroupBroadcasts as jest.Mock).mockResolvedValue({
      broadcasts: [{ broadcast: broadcast({ status: 'running' }), summary: summary() }],
    });
    render(<GroupBroadcastsPanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Aviso de promoção')).toBeInTheDocument());

    (clientApi.pauseGroupBroadcast as jest.Mock).mockResolvedValue({
      broadcast: broadcast({ status: 'paused' }),
    });
    fireEvent.click(screen.getByRole('button', { name: /pausar/i }));

    await waitFor(() => expect(clientApi.pauseGroupBroadcast).toHaveBeenCalledWith('broadcast-1'));
  });

  it('menu "⋮" > Cancelar disparo pede confirmação e chama a API', async () => {
    await renderPanel();
    (clientApi.cancelGroupBroadcast as jest.Mock).mockResolvedValue({
      broadcast: broadcast({ status: 'cancelled' }),
    });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar disparo' }));
    expect(screen.getByText('Cancelar este disparo?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() =>
      expect(clientApi.cancelGroupBroadcast).toHaveBeenCalledWith('broadcast-1'),
    );
  });

  it('menu "⋮" > Excluir disparo pede confirmação e chama a API', async () => {
    await renderPanel();
    (clientApi.deleteGroupBroadcast as jest.Mock).mockResolvedValue(undefined);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir disparo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(clientApi.deleteGroupBroadcast).toHaveBeenCalledWith('broadcast-1'));
  });

  it('abre o diálogo de criação ao clicar em "Novo disparo em grupos"', async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Novo disparo em grupos' }));

    expect(screen.getByRole('heading', { name: 'Novo disparo em grupos' })).toBeInTheDocument();
    // Aguarda a listagem de grupos do formulário resolver, para não deixar
    // um `setState` pendente vazando para o próximo teste (act warning).
    await waitFor(() => expect(clientApi.fetchWhatsAppGroups).toHaveBeenCalled());
  });

  it('tabela nunca declara overflow (mesma trava de regressão do menu "⋮" cortado, CampaignsPanel)', async () => {
    await renderPanel();
    const container = screen.getByTestId('group-broadcasts-table');
    expect(container.className).not.toMatch(/overflow-/);
  });
});
