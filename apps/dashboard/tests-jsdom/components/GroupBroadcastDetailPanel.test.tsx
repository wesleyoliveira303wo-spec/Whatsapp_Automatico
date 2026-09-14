/**
 * `GroupBroadcastDetailPanel` — Disparos em grupos (2026-09-11), estendido em
 * 2026-09-14 para campanhas com múltiplas publicações: resumo, status por
 * grupo, publicações da sequência (destacando a atual) e as ações do motor
 * de envio. "Iniciar" pede confirmação explícita nomeando quantos grupos e
 * o risco.
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
  removeGroupBroadcastStepMedia: jest.fn(),
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
    status: 'draft',
    intervalSeconds: 60,
    createdAt: '2026-09-11T10:00:00.000Z',
    updatedAt: '2026-09-11T10:00:00.000Z',
    ...over,
  };
}

function step(over: Partial<clientApi.GroupBroadcastStep> = {}): clientApi.GroupBroadcastStep {
  return {
    id: 'step-1',
    broadcastId: 'broadcast-1',
    order: 0,
    messageTemplate: 'Olá, pessoal!',
    runsCompleted: 0,
    createdAt: '2026-09-11T10:00:00.000Z',
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
    sentCount: 0,
    createdAt: '2026-09-11T10:00:00.000Z',
    ...over,
  };
}

function mockDetail(over: {
  broadcast?: Partial<clientApi.GroupBroadcast>;
  steps?: clientApi.GroupBroadcastStep[];
  summary?: Partial<clientApi.GroupBroadcastSummary>;
  targets?: clientApi.GroupBroadcastTarget[];
} = {}): void {
  (clientApi.fetchGroupBroadcast as jest.Mock).mockResolvedValue({
    broadcast: broadcast(over.broadcast),
    steps: over.steps ?? [step()],
    summary: { total: 1, pending: 1, sent: 0, failed: 0, skipped: 0, totalSent: 0, ...over.summary },
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

  it('mostra o resumo, a publicação e a lista de grupos-alvo', async () => {
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
    mockDetail({ summary: { pending: 5, total: 5 } });
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

  it('com múltiplas etapas: o diálogo mostra GRUPOS DISTINTOS, nunca o pending somado das etapas (2026-09-14)', async () => {
    // 1 grupo real, 2 etapas → summary.pending = 2 (soma das 2 etapas), mas
    // só existe 1 grupo de verdade — o diálogo não pode dizer "2 grupos".
    mockDetail({
      summary: { pending: 2, total: 1, skipped: 0 },
      steps: [step({ id: 's1', order: 0 }), step({ id: 's2', order: 1, messageTemplate: 'Segunda' })],
    });
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /iniciar envio/i }));

    expect(
      screen.getByRole('heading', { name: /Iniciar publicação em 1 grupo\?/ }),
    ).toBeInTheDocument();
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

  it('mídia anexada na etapa: mostra o anexo, e "Remover" só aparece em draft', async () => {
    mockDetail({
      steps: [step({ media: { contentType: 'video', mimeType: 'video/mp4', fileName: 'promo.mp4' } })],
    });
    await renderPanel();

    expect(screen.getByText('promo.mp4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover anexo da publicação 1' })).toBeInTheDocument();
  });

  it('mídia anexada num disparo RUNNING: não mostra "Remover"', async () => {
    mockDetail({
      broadcast: { status: 'running' },
      steps: [step({ media: { contentType: 'image', mimeType: 'image/jpeg' } })],
    });
    await renderPanel();

    expect(
      screen.queryByRole('button', { name: 'Remover anexo da publicação 1' }),
    ).not.toBeInTheDocument();
  });
});

describe('GroupBroadcastDetailPanel — publicações e repetição (2026-09-14)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('disparo único, sem repetição: nenhuma informação de repetição', async () => {
    mockDetail();
    await renderPanel();

    expect(screen.queryByText(/Repete a cada/)).not.toBeInTheDocument();
  });

  it('etapas em paralelo (2026-09-14): cada publicação mostra o SEU PRÓPRIO status, independente das demais', async () => {
    mockDetail({
      broadcast: { status: 'running' },
      steps: [
        step({ id: 's1', order: 0, messageTemplate: 'Primeira', startedAt: '2026-09-11T10:00:00.000Z' }),
        step({ id: 's2', order: 1, messageTemplate: 'Segunda' }), // ainda não começou
        step({
          id: 's3',
          order: 2,
          messageTemplate: 'Terceira',
          startedAt: '2026-09-11T09:00:00.000Z',
          finishedAt: '2026-09-11T11:00:00.000Z',
        }),
      ],
    });
    await renderPanel();

    expect(screen.getByText('Publicação 1 de 3')).toBeInTheDocument();
    expect(screen.getByText('Primeira')).toBeInTheDocument();
    expect(screen.getByText('Segunda')).toBeInTheDocument();
    expect(screen.getByText('Terceira')).toBeInTheDocument();
    expect(screen.getByText('Aguardando início')).toBeInTheDocument(); // Segunda
    expect(screen.getByText('Concluída')).toBeInTheDocument(); // Terceira
    // Duas badges "Em execução" na tela: o status geral do disparo e o selo
    // da Primeira publicação (a única em execução).
    expect(screen.getAllByText('Em execução')).toHaveLength(2);
  });

  it('recorrente com teto: mostra o andamento e a próxima publicação', async () => {
    mockDetail({
      broadcast: { status: 'running' },
      steps: [
        step({
          startedAt: '2026-09-11T10:00:00.000Z',
          recurrenceIntervalHours: 2,
          recurrenceMaxRuns: 5,
          runsCompleted: 2,
          nextRunAt: '2026-09-12T14:30:00.000Z',
        }),
      ],
    });
    await renderPanel();

    expect(screen.getByText(/Repete a cada 2 horas/)).toBeInTheDocument();
    expect(screen.getByText(/2 de 5 repetições/)).toBeInTheDocument();
    expect(screen.getByText(/Próxima publicação em/)).toBeInTheDocument();
  });

  it('sem limite: avisa que só para quando cancelarem', async () => {
    mockDetail({
      broadcast: { status: 'running' },
      steps: [
        step({ startedAt: '2026-09-11T10:00:00.000Z', recurrenceIntervalHours: 1, runsCompleted: 7 }),
      ],
    });
    await renderPanel();

    expect(screen.getByText(/sem prazo para acabar/i)).toBeInTheDocument();
  });

  it('com janela de horário (campanha inteira): mostra o intervalo permitido', async () => {
    mockDetail({
      broadcast: { status: 'running', sendWindowStart: '09:00', sendWindowEnd: '18:00' },
      steps: [
        step({ startedAt: '2026-09-11T10:00:00.000Z', recurrenceIntervalHours: 3, runsCompleted: 1 }),
      ],
    });
    await renderPanel();

    expect(screen.getByText(/entre 09:00 e 18:00/)).toBeInTheDocument();
  });

  it('depois de iniciado, avisa que a lista de publicações é somente leitura', async () => {
    mockDetail({ broadcast: { status: 'running' } });
    await renderPanel();

    expect(
      screen.getByText('Disparo já iniciado — a lista de publicações é somente leitura.'),
    ).toBeInTheDocument();
  });
});
