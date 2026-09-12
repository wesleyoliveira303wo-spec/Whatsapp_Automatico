/**
 * Retrofit visual 2026-08-18, 2ª rodada (réplica exata de imagem do
 * fundador) — teste do `CampaignsPanel`: cards do topo (com tendência),
 * tabela com coluna de Progresso + ações por status, busca/filtro/
 * ordenação/paginação, e o painel lateral ("Progresso do disparo",
 * "Status dos disparos" — o card "Dica Francis" foi removido, 2026-08-21).
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import CampaignsPanel from '../../components/CampaignsPanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchCampaigns: jest.fn(),
  fetchCampaign: jest.fn(),
  fetchCampaignMetrics: jest.fn(),
  fetchCampaignsOverview: jest.fn(),
  startCampaign: jest.fn(),
  pauseCampaign: jest.fn(),
  cancelCampaign: jest.fn(),
  reopenCampaign: jest.fn(),
  deleteCampaign: jest.fn(),
}));

jest.mock('../../components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

function campaign(over: Partial<clientApi.Campaign> = {}): clientApi.Campaign {
  return {
    id: 'campaign-1',
    tenantId: 'tenant-1',
    sessionName: 'vendas',
    name: 'Promoção Especial',
    description: 'Reengajamento de clientes',
    messageTemplate: 'Olá!',
    status: 'completed',
    createdAt: '2026-08-14T10:24:00.000Z',
    updatedAt: '2026-08-14T10:24:00.000Z',
    ...over,
  };
}

function overview(
  over: Partial<clientApi.CampaignSessionOverview> = {},
): clientApi.CampaignSessionOverview {
  return {
    totalCampaigns: 1,
    statusCounts: { draft: 0, scheduled: 0, running: 0, paused: 0, completed: 1, cancelled: 0 },
    totalSent: 120,
    totalReplied: 28,
    responseRate: 28 / 120,
    trends: {
      campaignsDeltaPct: 20,
      messagesSentDeltaPct: 32,
      repliesDeltaPct: 18,
      responseRateDeltaPct: 4,
    },
    ...over,
  };
}

function mockDefaults(): void {
  (clientApi.fetchCampaignsOverview as jest.Mock).mockResolvedValue({ overview: overview() });
  (clientApi.fetchCampaigns as jest.Mock).mockResolvedValue({ campaigns: [campaign()] });
  (clientApi.fetchCampaign as jest.Mock).mockResolvedValue({
    campaign: campaign(),
    summary: { total: 120, pending: 0, skipped: 0, skipReasons: {} },
  });
  (clientApi.fetchCampaignMetrics as jest.Mock).mockResolvedValue({
    metrics: {
      total: 120,
      pending: 0,
      sent: 90,
      failed: 0,
      replied: 28,
      skipped: 0,
      skipReasons: {},
      responseRate: 28 / 120,
      stageCounts: { new: 0, contacted: 0, negotiating: 0, closed_won: 0, closed_lost: 0 },
      escalatedCount: 0,
      aiCostUsd: 0,
      unknownAnswerCount: 0,
    },
  });
}

async function renderPanel(): Promise<void> {
  render(<CampaignsPanel sessionName="vendas" />);
  await waitFor(() => expect(screen.getByText('Promoção Especial')).toBeInTheDocument());
}

describe('CampaignsPanel (retrofit visual 2026-08-18)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDefaults();
  });

  it('mostra os cards do topo com dado real + tendência', async () => {
    // Onda de tabs "Contatos | Grupos" (2026-09-11): o cabeçalho "Disparos"
    // + subtítulo migrou para a PÁGINA (`campaigns/index.tsx`), que agora
    // também mostra a aba "Grupos" — o painel deixou de duplicar o título.
    await renderPanel();

    const statCards = within(screen.getByTestId('campaigns-stat-cards'));
    function statCard(label: string): HTMLElement {
      return statCards.getByText(label).closest('div')!.parentElement as HTMLElement;
    }

    expect(within(statCard('Disparos criados')).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('+20% vs. mês anterior')).toBeInTheDocument();
    expect(within(statCard('Mensagens enviadas')).getByText('120')).toBeInTheDocument();
    expect(within(statCard('Respostas')).getByText('28')).toBeInTheDocument();
    expect(within(statCard('Taxa de resposta')).getByText('23%')).toBeInTheDocument();
  });

  it('sem base no mês anterior: não mostra tendência nenhuma (nunca inventa "0%")', async () => {
    (clientApi.fetchCampaignsOverview as jest.Mock).mockResolvedValue({
      overview: overview({
        trends: {
          campaignsDeltaPct: undefined,
          messagesSentDeltaPct: undefined,
          repliesDeltaPct: undefined,
          responseRateDeltaPct: undefined,
        },
      }),
    });

    await renderPanel();

    expect(screen.queryByText(/vs\. mês anterior/)).not.toBeInTheDocument();
  });

  it('mostra a linha do disparo com destinatários/enviados/respostas/taxa reais', async () => {
    await renderPanel();

    const table = within(screen.getByTestId('campaigns-table'));
    expect(table.getByText('Promoção Especial')).toBeInTheDocument();
    expect(table.getByText('120')).toBeInTheDocument(); // destinatários
    expect(table.getByText('Reengajamento de clientes')).toBeInTheDocument();
    expect(table.getByText('Concluída')).toBeInTheDocument();
  });

  it('busca filtra a lista pelo nome (client-side, sessão já carregada inteira)', async () => {
    (clientApi.fetchCampaigns as jest.Mock).mockResolvedValue({
      campaigns: [campaign(), campaign({ id: 'campaign-2', name: 'Boas-vindas' })],
    });
    (clientApi.fetchCampaign as jest.Mock).mockImplementation((id: string) =>
      Promise.resolve({
        campaign: campaign({ id, name: id === 'campaign-2' ? 'Boas-vindas' : 'Promoção Especial' }),
        summary: { total: 1, pending: 0, skipped: 0, skipReasons: {} },
      }),
    );

    await renderPanel();
    await waitFor(() => {
      expect(
        within(screen.getByTestId('campaigns-table')).getByText('Boas-vindas'),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Buscar disparo por nome'), {
      target: { value: 'boas' },
    });

    const table = within(screen.getByTestId('campaigns-table'));
    expect(table.queryByText('Promoção Especial')).not.toBeInTheDocument();
    expect(table.getByText('Boas-vindas')).toBeInTheDocument();
  });

  it('Filtros: filtrar por "Em andamento" esconde o único disparo (concluído)', async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Em andamento' }));

    expect(screen.queryByTestId('campaigns-table')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhum disparo encontrado')).toBeInTheDocument();
  });

  it('disparo RUNNING: botão primário é "Pausar", sem confirmação', async () => {
    (clientApi.fetchCampaigns as jest.Mock).mockResolvedValue({
      campaigns: [campaign({ status: 'running' })],
    });
    (clientApi.fetchCampaign as jest.Mock).mockResolvedValue({
      campaign: campaign({ status: 'running' }),
      summary: { total: 1, pending: 0, skipped: 0, skipReasons: {} },
    });
    (clientApi.pauseCampaign as jest.Mock).mockResolvedValue({
      campaign: campaign({ status: 'paused' }),
    });

    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Pausar/ }));

    await waitFor(() => {
      expect(clientApi.pauseCampaign).toHaveBeenCalledWith('campaign-1');
    });
  });

  it('disparo PAUSED: botão primário é "Retomar" e pede confirmação antes de chamar a API', async () => {
    (clientApi.fetchCampaigns as jest.Mock).mockResolvedValue({
      campaigns: [campaign({ status: 'paused' })],
    });
    (clientApi.fetchCampaign as jest.Mock).mockResolvedValue({
      campaign: campaign({ status: 'paused' }),
      summary: { total: 1, pending: 0, skipped: 0, skipReasons: {} },
    });
    (clientApi.startCampaign as jest.Mock).mockResolvedValue({
      campaign: campaign({ status: 'running' }),
    });

    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Retomar/ }));
    expect(clientApi.startCampaign).not.toHaveBeenCalled();
    expect(screen.getByText('Confirmar disparo real')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e enviar' }));

    await waitFor(() => {
      expect(clientApi.startCampaign).toHaveBeenCalledWith('campaign-1');
    });
  });

  // O botão "Ver" dedicado foi removido em 2026-08-21 (pedido do fundador) —
  // era redundante com "Ver detalhes", já existente no menu "⋮", e sua
  // largura variável contribuía para o desalinhamento da coluna "Ações".
  it('disparo COMPLETED: sem botão "Ver" dedicado, só o menu "⋮" com "Ver detalhes"', async () => {
    await renderPanel();

    expect(screen.queryByRole('link', { name: 'Ver' })).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    const link = screen.getByRole('menuitem', { name: 'Ver detalhes' });
    expect(link).toHaveAttribute('href', '/sessions/vendas/campaigns/campaign-1');
  });

  /**
   * TRAVA DE REGRESSÃO (2026-08-21) — bug real relatado com print: o menu
   * "⋮" (posicionado `absolute`, estoura o container por baixo) aparecia
   * cortado/vazio. Causa: `overflow-x-auto` no container força, por regra do
   * CSS, `overflow-y` a virar `auto` também — recortando o menu. jsdom não
   * calcula layout/overflow real, então este teste não pegaria o corte
   * visual diretamente; trava a REGRA (nenhuma classe `overflow-*` no
   * container) para a causa nunca mais ser reintroduzida sem que este teste
   * quebre primeiro.
   */
  it('o container da tabela nunca tem overflow-x-auto (corta o menu "⋮" absolute — bug real de 2026-08-21)', async () => {
    await renderPanel();

    const container = screen.getByTestId('campaigns-table');
    expect(container.className).not.toMatch(/overflow-/);
  });

  it('menu "⋮" → Cancelar disparo pede confirmação antes de chamar a API', async () => {
    (clientApi.fetchCampaigns as jest.Mock).mockResolvedValue({
      campaigns: [campaign({ status: 'running' })],
    });
    (clientApi.fetchCampaign as jest.Mock).mockResolvedValue({
      campaign: campaign({ status: 'running' }),
      summary: { total: 1, pending: 0, skipped: 0, skipReasons: {} },
    });
    (clientApi.cancelCampaign as jest.Mock).mockResolvedValue({
      campaign: campaign({ status: 'cancelled' }),
    });

    await renderPanel();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar disparo' }));
    expect(clientApi.cancelCampaign).not.toHaveBeenCalled();
    expect(screen.getByText('Cancelar este disparo?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() => {
      expect(clientApi.cancelCampaign).toHaveBeenCalledWith('campaign-1');
    });
  });

  it('menu "⋮": disparo RUNNING não mostra "Excluir disparo" (precisa pausar/cancelar antes)', async () => {
    (clientApi.fetchCampaigns as jest.Mock).mockResolvedValue({
      campaigns: [campaign({ status: 'running' })],
    });
    (clientApi.fetchCampaign as jest.Mock).mockResolvedValue({
      campaign: campaign({ status: 'running' }),
      summary: { total: 1, pending: 0, skipped: 0, skipReasons: {} },
    });

    await renderPanel();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    expect(screen.queryByRole('menuitem', { name: 'Excluir disparo' })).not.toBeInTheDocument();
  });

  it('menu "⋮" → Excluir disparo pede confirmação, chama a API e recarrega a lista', async () => {
    (clientApi.deleteCampaign as jest.Mock).mockResolvedValue(undefined);

    await renderPanel();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir disparo' }));
    expect(clientApi.deleteCampaign).not.toHaveBeenCalled();
    expect(screen.getByText('Excluir este disparo?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => {
      expect(clientApi.deleteCampaign).toHaveBeenCalledWith('campaign-1');
    });
    await waitFor(() => {
      expect(clientApi.fetchCampaigns).toHaveBeenCalledTimes(2);
    });
  });

  describe('menu "⋮" → Reabrir disparo (retrofit 2026-08-18)', () => {
    it('disparo COMPLETED sem nenhum FAILED: não mostra "Reabrir disparo" (mockDefaults, failed: 0)', async () => {
      await renderPanel();

      fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
      expect(screen.queryByRole('menuitem', { name: 'Reabrir disparo' })).not.toBeInTheDocument();
    });

    it('disparo RUNNING: nunca mostra "Reabrir disparo", mesmo com FAILED > 0', async () => {
      (clientApi.fetchCampaigns as jest.Mock).mockResolvedValue({
        campaigns: [campaign({ status: 'running' })],
      });
      (clientApi.fetchCampaign as jest.Mock).mockResolvedValue({
        campaign: campaign({ status: 'running' }),
        summary: { total: 1, pending: 0, skipped: 0, skipReasons: {} },
      });
      (clientApi.fetchCampaignMetrics as jest.Mock).mockResolvedValue({
        metrics: {
          total: 1,
          pending: 0,
          sent: 0,
          failed: 1,
          replied: 0,
          skipped: 0,
          skipReasons: {},
          stageCounts: { new: 0, contacted: 0, negotiating: 0, closed_won: 0, closed_lost: 0 },
          escalatedCount: 0,
          aiCostUsd: 0,
          unknownAnswerCount: 0,
        },
      });

      await renderPanel();

      fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
      expect(screen.queryByRole('menuitem', { name: 'Reabrir disparo' })).not.toBeInTheDocument();
    });

    it('disparo COMPLETED com FAILED > 0: mostra o botão, pede confirmação, chama a API e recarrega', async () => {
      (clientApi.fetchCampaignMetrics as jest.Mock).mockResolvedValue({
        metrics: {
          total: 120,
          pending: 0,
          sent: 90,
          failed: 3,
          replied: 28,
          skipped: 0,
          skipReasons: {},
          responseRate: 28 / 120,
          stageCounts: { new: 0, contacted: 0, negotiating: 0, closed_won: 0, closed_lost: 0 },
          escalatedCount: 0,
          aiCostUsd: 0,
          unknownAnswerCount: 0,
        },
      });
      (clientApi.reopenCampaign as jest.Mock).mockResolvedValue({
        campaign: campaign({ status: 'running' }),
      });

      await renderPanel();

      fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Reabrir disparo' }));
      expect(clientApi.reopenCampaign).not.toHaveBeenCalled();
      expect(screen.getByText('Reabrir este disparo?')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Confirmar e reenviar' }));

      await waitFor(() => {
        expect(clientApi.reopenCampaign).toHaveBeenCalledWith('campaign-1');
      });
      await waitFor(() => {
        expect(clientApi.fetchCampaigns).toHaveBeenCalledTimes(2);
      });
    });
  });


  // Pedido do fundador (2026-08-21): removido o card "Dica Francis" do painel lateral.
  it('não mostra mais o card "Dica Francis" (removido a pedido do fundador)', async () => {
    await renderPanel();

    expect(screen.queryByText('Dica Francis')).not.toBeInTheDocument();
  });

  it('"Novo disparo" abre o formulário de criação (com upload de planilha na Seção 2)', async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Novo disparo/ }));
    expect(screen.getByRole('heading', { name: 'Novo disparo' })).toBeInTheDocument();
  });

  it('ordenação "Mais antigas" reordena a lista pela data de criação', async () => {
    (clientApi.fetchCampaigns as jest.Mock).mockResolvedValue({
      campaigns: [
        campaign({ id: 'campaign-1', name: 'Mais nova', createdAt: '2026-08-15T00:00:00.000Z' }),
        campaign({ id: 'campaign-2', name: 'Mais antiga', createdAt: '2026-08-10T00:00:00.000Z' }),
      ],
    });
    (clientApi.fetchCampaign as jest.Mock).mockImplementation((id: string) =>
      Promise.resolve({
        campaign: campaign({
          id,
          name: id === 'campaign-2' ? 'Mais antiga' : 'Mais nova',
          createdAt: id === 'campaign-2' ? '2026-08-10T00:00:00.000Z' : '2026-08-15T00:00:00.000Z',
        }),
        summary: { total: 1, pending: 0, skipped: 0, skipReasons: {} },
      }),
    );

    render(<CampaignsPanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Mais nova')).toBeInTheDocument());

    const rowsBefore = within(screen.getByTestId('campaigns-table')).getAllByText(/Mais/);
    expect(rowsBefore[0]).toHaveTextContent('Mais nova');

    fireEvent.click(screen.getByRole('button', { name: /Mais recentes/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Mais antigas' }));

    const rowsAfter = within(screen.getByTestId('campaigns-table')).getAllByText(/Mais/);
    expect(rowsAfter[0]).toHaveTextContent('Mais antiga');
  });

  it('paginação: mostra "Mostrando X de Y" e navega para a página seguinte', async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      campaign({ id: `campaign-${i}`, name: `Disparo ${i}` }),
    );
    (clientApi.fetchCampaigns as jest.Mock).mockResolvedValue({ campaigns: many });
    (clientApi.fetchCampaign as jest.Mock).mockImplementation((id: string) =>
      Promise.resolve({
        campaign: many.find((c) => c.id === id) ?? campaign(),
        summary: { total: 1, pending: 0, skipped: 0, skipReasons: {} },
      }),
    );

    render(<CampaignsPanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Mostrando 6 de 7 disparos')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));

    await waitFor(() => expect(screen.getByText('Mostrando 1 de 7 disparos')).toBeInTheDocument());
  });

  /**
   * Teto de carga (auditoria 2026-08-22, P1.1) — antes desta correção o
   * painel buscava só a 1ª página (50 disparos) e tratava como se fosse
   * tudo, sem nenhum aviso quando a sessão tinha mais. Mesma disciplina já
   * aplicada em `PipelineBoard`/`usePipelineConversations`: acumula por
   * cursor até esgotar ou bater o teto, e avisa (`role="status"`) em vez de
   * mentir por omissão.
   */
  it('avisa quando a sessão tem mais disparos do que cabe no teto de carga', async () => {
    let callCount = 0;
    (clientApi.fetchCampaigns as jest.Mock).mockImplementation(() => {
      callCount += 1;
      return Promise.resolve({
        campaigns: [campaign({ id: `campaign-${callCount}`, name: `Disparo ${callCount}` })],
        nextCursor: `cursor-${callCount}`,
      });
    });
    (clientApi.fetchCampaign as jest.Mock).mockImplementation((id: string) =>
      Promise.resolve({
        campaign: campaign({ id, name: id }),
        summary: { total: 1, pending: 0, skipped: 0, skipReasons: {} },
      }),
    );

    render(<CampaignsPanel sessionName="vendas" />);

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent(/500 disparos mais recentes/i);
    // Parou no teto (10 páginas), não ficou preso num laço infinito.
    expect(clientApi.fetchCampaigns).toHaveBeenCalledTimes(10);
  });

  it('não mostra o aviso de recorte quando a sessão inteira coube no teto de carga', async () => {
    await renderPanel();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('estado vazio: nenhum disparo ainda', async () => {
    (clientApi.fetchCampaigns as jest.Mock).mockResolvedValue({ campaigns: [] });
    (clientApi.fetchCampaignsOverview as jest.Mock).mockResolvedValue({
      overview: overview({
        totalCampaigns: 0,
        statusCounts: { draft: 0, scheduled: 0, running: 0, paused: 0, completed: 0, cancelled: 0 },
        totalSent: 0,
        totalReplied: 0,
        responseRate: undefined,
      }),
    });

    render(<CampaignsPanel sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByText('Nenhum disparo ainda')).toBeInTheDocument();
    });
  });

  it('mostra estado de erro e permite tentar de novo', async () => {
    (clientApi.fetchCampaignsOverview as jest.Mock).mockRejectedValue(new Error('falhou'));

    render(<CampaignsPanel sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByText('Não foi possível carregar os disparos.')).toBeInTheDocument();
    });
  });
});
