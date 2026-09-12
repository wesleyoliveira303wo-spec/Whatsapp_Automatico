/**
 * `GroupBroadcastDetailPanel` — Disparos em grupos (2026-09-11): resumo,
 * status por grupo, e as ações do motor de envio. "Iniciar" pede
 * confirmação explícita nomeando quantos grupos e o risco.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import GroupBroadcastDetailPanel from '../../components/GroupBroadcastDetailPanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchGroupBroadcast: jest.fn(),
  startGroupBroadcast: jest.fn(),
  pauseGroupBroadcast: jest.fn(),
  cancelGroupBroadcast: jest.fn(),
  removeGroupBroadcastMedia: jest.fn(),
}));

jest.mock('../../components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

// `usePollingRefresh` dispara em intervalo real — irrelevante para estes
// testes (mesmo padrão já usado por `CampaignDetailPanel.test.tsx`).
jest.mock('../../hooks/usePollingRefresh', () => ({
  usePollingRefresh: jest.fn(),
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

function target(over: Partial<clientApi.GroupBroadcastTarget> = {}): clientApi.GroupBroadcastTarget {
  return {
    id: 'target-1',
    broadcastId: 'broadcast-1',
    groupJid: '111@g.us',
    groupName: 'Grupo 1',
    status: 'pending',
    createdAt: '2026-09-11T10:00:00.000Z',
    ...over,
  };
}

function mockDetail(over: {
  broadcast?: Partial<clientApi.GroupBroadcast>;
  summary?: Partial<clientApi.GroupBroadcastSummary>;
  targets?: clientApi.GroupBroadcastTarget[];
} = {}): void {
  (clientApi.fetchGroupBroadcast as jest.Mock).mockResolvedValue({
    broadcast: broadcast(over.broadcast),
    summary: { total: 1, pending: 1, sent: 0, failed: 0, skipped: 0, ...over.summary },
    targets: over.targets ?? [target()],
  });
}

async function renderPanel(): Promise<void> {
  render(<GroupBroadcastDetailPanel sessionName="vendas" broadcastId="broadcast-1" />);
  await waitFor(() => expect(screen.getByText('Aviso de promoção')).toBeInTheDocument());
}

describe('GroupBroadcastDetailPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDetail();
  });

  it('mostra o resumo, a mensagem e a lista de grupos-alvo', async () => {
    await renderPanel();

    expect(screen.getByText('Olá, pessoal!')).toBeInTheDocument();
    const table = within(screen.getByTestId('group-broadcast-targets-table'));
    expect(table.getByText('Grupo 1')).toBeInTheDocument();
    expect(table.getByText('Aguardando envio')).toBeInTheDocument();
  });

  it('erro ao carregar mostra o ErrorState com retry', async () => {
    (clientApi.fetchGroupBroadcast as jest.Mock).mockRejectedValue(new Error('falhou'));
    render(<GroupBroadcastDetailPanel sessionName="vendas" broadcastId="broadcast-1" />);

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar este disparo.')).toBeInTheDocument(),
    );
  });

  it('"Iniciar" pede confirmação explícita nomeando quantos grupos e o risco', async () => {
    mockDetail({ summary: { pending: 5 } });
    await renderPanel();
    (clientApi.startGroupBroadcast as jest.Mock).mockResolvedValue({
      broadcast: broadcast({ status: 'running' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /iniciar envio/i }));

    expect(
      screen.getByRole('heading', { name: /Iniciar publicação em 5 grupos\?/ }),
    ).toBeInTheDocument();
    expect(screen.getByText((text) => text.toLowerCase().includes('banido'))).toBeInTheDocument();
    expect(clientApi.startGroupBroadcast).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e publicar' }));

    await waitFor(() =>
      expect(clientApi.startGroupBroadcast).toHaveBeenCalledWith('broadcast-1'),
    );
  });

  it('"Retomar envio" aparece para um disparo pausado, com texto próprio', async () => {
    mockDetail({ broadcast: { status: 'paused' } });
    await renderPanel();

    expect(screen.getByRole('button', { name: /retomar envio/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^iniciar envio$/i })).not.toBeInTheDocument();
  });

  it('"Iniciar"/"Pausar"/"Cancelar" ficam desabilitados conforme o status (draft: só Iniciar/Cancelar ativos)', async () => {
    await renderPanel();

    expect(screen.getByRole('button', { name: /iniciar envio/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /^pausar$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancelar disparo/i })).not.toBeDisabled();
  });

  it('Pausar chama a API e atualiza o status', async () => {
    mockDetail({ broadcast: { status: 'running' } });
    await renderPanel();
    (clientApi.pauseGroupBroadcast as jest.Mock).mockResolvedValue({
      broadcast: broadcast({ status: 'paused' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /^pausar$/i }));

    await waitFor(() => expect(clientApi.pauseGroupBroadcast).toHaveBeenCalledWith('broadcast-1'));
  });

  it('Cancelar pede confirmação antes de chamar a API', async () => {
    await renderPanel();
    (clientApi.cancelGroupBroadcast as jest.Mock).mockResolvedValue({
      broadcast: broadcast({ status: 'cancelled' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /cancelar disparo/i }));
    expect(screen.getByText('Cancelar este disparo?')).toBeInTheDocument();
    expect(clientApi.cancelGroupBroadcast).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() =>
      expect(clientApi.cancelGroupBroadcast).toHaveBeenCalledWith('broadcast-1'),
    );
  });

  it('mostra o motivo de falha/supressão por grupo', async () => {
    mockDetail({
      targets: [
        target({ id: 't1', status: 'failed', errorMessage: 'erro ao enviar' }),
        target({ id: 't2', status: 'skipped', skipReason: 'admin_only_group' }),
      ],
    });
    await renderPanel();

    expect(screen.getByText('erro ao enviar')).toBeInTheDocument();
    expect(
      screen.getByText('Só administradores podem publicar neste grupo'),
    ).toBeInTheDocument();
  });

  it('disparo pausado automaticamente pelo disjuntor mostra o motivo', async () => {
    mockDetail({ broadcast: { status: 'paused', pausedReason: 'consecutive_failures' } });
    await renderPanel();

    expect(
      screen.getByText(/pausado automaticamente: as duas últimas tentativas falharam/i),
    ).toBeInTheDocument();
  });

  it('mídia anexada: mostra o anexo, e "Remover" só aparece em draft', async () => {
    mockDetail({
      broadcast: { media: { contentType: 'video', mimeType: 'video/mp4', fileName: 'promo.mp4' } },
    });
    await renderPanel();

    expect(screen.getByText('promo.mp4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover anexo' })).toBeInTheDocument();
  });

  it('mídia anexada num disparo RUNNING: não mostra "Remover"', async () => {
    mockDetail({
      broadcast: {
        status: 'running',
        media: { contentType: 'image', mimeType: 'image/jpeg' },
      },
    });
    await renderPanel();

    expect(screen.queryByRole('button', { name: 'Remover anexo' })).not.toBeInTheDocument();
  });
});

describe('GroupBroadcastDetailPanel — repetição (2026-09-11)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('disparo único: nenhuma informação de repetição', async () => {
    mockDetail();
    await renderPanel();

    expect(screen.queryByText(/Repete a cada/)).not.toBeInTheDocument();
  });

  it('recorrente com teto: mostra o andamento e a próxima publicação', async () => {
    mockDetail({
      broadcast: {
        status: 'running',
        recurrenceIntervalHours: 2,
        recurrenceMaxRuns: 5,
        runsCompleted: 2,
        nextRunAt: '2026-09-12T14:30:00.000Z',
      },
    });
    await renderPanel();

    expect(screen.getByText(/Repete a cada 2 horas/)).toBeInTheDocument();
    expect(screen.getByText(/2 de 5/)).toBeInTheDocument();
    expect(screen.getByText(/Próxima publicação em/)).toBeInTheDocument();
  });

  it('sem limite: avisa que só para quando cancelarem', async () => {
    mockDetail({
      broadcast: { status: 'running', recurrenceIntervalHours: 1, runsCompleted: 7 },
    });
    await renderPanel();

    expect(screen.getByText(/sem prazo para acabar/i)).toBeInTheDocument();
  });

  it('com janela de horário: mostra o intervalo permitido', async () => {
    mockDetail({
      broadcast: {
        status: 'running',
        recurrenceIntervalHours: 3,
        runsCompleted: 1,
        sendWindowStart: '09:00',
        sendWindowEnd: '18:00',
      },
    });
    await renderPanel();

    expect(screen.getByText(/só entre 09:00 e 18:00/)).toBeInTheDocument();
  });
});
