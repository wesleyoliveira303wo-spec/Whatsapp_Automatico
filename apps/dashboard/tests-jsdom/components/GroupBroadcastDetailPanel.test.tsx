/**
 * `GroupBroadcastDetailPanel` — Disparos em grupos (2026-09-11), estendido em
 * 2026-09-14 para campanhas com múltiplas publicações: resumo, status por
 * grupo, publicações da sequência (destacando a atual) e as ações do motor
 * de envio. "Iniciar" pede confirmação explícita nomeando quantos grupos e
 * o risco.
 */
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
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
  fetchWhatsAppGroups: jest.fn(),
  updateGroupBroadcast: jest.fn(),
}));

jest.mock('../../components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

// Task 9 (2026-09-15) — o botão "Editar" lê `router.query.edit`/`router.replace`.
// Mesmo padrão de `SessionRail.test.tsx`: `next/router` não tem contexto real
// em teste, então o mock é explícito.
const mockRouterReplace = jest.fn();
let mockRouterQuery: Record<string, string> = {};
jest.mock('next/router', () => ({
  useRouter: () => ({
    query: mockRouterQuery,
    pathname: '/sessions/[sessionName]/campaigns/groups/[broadcastId]',
    replace: mockRouterReplace,
  }),
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
    createdAt: '2026-09-11T10:00:00.000Z',
    ...over,
  };
}

/** Progresso REAL de um grupo numa publicação — o que a lista de grupos hoje exibe. */
function stepTarget(
  over: Partial<clientApi.GroupBroadcastStepTarget> = {},
): clientApi.GroupBroadcastStepTarget {
  return {
    id: 'target-1',
    stepId: 'step-1',
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
  /** Chaveado por `stepId` — default: um alvo pendente na primeira etapa. */
  stepTargets?: Record<string, clientApi.GroupBroadcastStepTarget[]>;
} = {}): void {
  const steps = over.steps ?? [step()];
  (clientApi.fetchGroupBroadcast as jest.Mock).mockResolvedValue({
    broadcast: broadcast(over.broadcast),
    steps,
    summary: { total: 1, pending: 1, sent: 0, failed: 0, skipped: 0, totalSent: 0, ...over.summary },
    targets: over.targets ?? [target()],
    stepTargets: over.stepTargets ?? { [steps[0].id]: [stepTarget({ stepId: steps[0].id })] },
  });
}

afterEach(() => {
  cleanup();
});

async function renderPanel(): Promise<void> {
  const { container } = render(
    <GroupBroadcastDetailPanel sessionName="vendas" broadcastId="broadcast-1" />,
  );
  await waitFor(
    () => expect(within(container).getByText('Aviso de promoção')).toBeInTheDocument(),
    { timeout: 3000 },
  );
}

describe('GroupBroadcastDetailPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouterQuery = {};
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
      expect(clientApi.startGroupBroadcast).toHaveBeenCalledWith('broadcast-1', 'now'),
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
      stepTargets: {
        'step-1': [
          stepTarget({ id: 't1', status: 'failed', errorMessage: 'erro ao enviar' }),
          stepTarget({ id: 't2', status: 'skipped', skipReason: 'admin_only_group' }),
        ],
      },
    });
    await renderPanel();

    // Duas cópias de cada: a coluna Detalhe (desktop) e a linha abaixo do grupo (celular).
    expect(screen.getAllByText('erro ao enviar')).toHaveLength(2);
    expect(screen.getAllByText('Só administradores podem publicar neste grupo')).toHaveLength(2);
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouterQuery = {};
  });

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
          nextRunAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        }),
      ],
    });
    await renderPanel();

    expect(screen.getByText(/Repete a cada 2 horas/)).toBeInTheDocument();
    expect(screen.getByText(/2 de 5 repetições/)).toBeInTheDocument();
    expect(screen.getByText(/Próxima publicação em/)).toBeInTheDocument();
  });

  // Achado real de produção (2026-09-17): depois de retomar, o horário salvo
  // ficava velho e a tela anunciava como "próxima" uma hora que já tinha passado.
  it('horário de próxima publicação já passado, com o disparo rodando: mostra "Publicando agora"', async () => {
    mockDetail({
      broadcast: { status: 'running' },
      steps: [
        step({
          startedAt: '2026-09-11T10:00:00.000Z',
          recurrenceIntervalHours: 4,
          runsCompleted: 6,
          nextRunAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        }),
      ],
    });
    await renderPanel();

    expect(screen.queryByText(/Próxima publicação em/)).not.toBeInTheDocument();
    expect(screen.getByText(/Publicando agora/)).toBeInTheDocument();
  });

  it('já publicou antes: mostra "Última publicação" acima de "Próxima publicação"', async () => {
    mockDetail({
      broadcast: { status: 'running' },
      steps: [
        step({
          startedAt: '2026-09-11T10:00:00.000Z',
          recurrenceIntervalHours: 2,
          runsCompleted: 1,
          nextRunAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      stepTargets: {
        'step-1': [stepTarget({ status: 'sent', sentAt: '2026-09-18T12:00:00.000Z' })],
      },
    });
    await renderPanel();

    expect(screen.getByText(/Última publicação em/)).toBeInTheDocument();
    expect(screen.getByText(/Próxima publicação em/)).toBeInTheDocument();
  });

  it('nunca publicou ainda: não mostra "Última publicação"', async () => {
    mockDetail({
      broadcast: { status: 'running' },
      steps: [
        step({
          startedAt: '2026-09-11T10:00:00.000Z',
          recurrenceIntervalHours: 2,
          nextRunAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      stepTargets: { 'step-1': [stepTarget({ status: 'pending' })] },
    });
    await renderPanel();

    expect(screen.queryByText(/Última publicação em/)).not.toBeInTheDocument();
  });

  it('várias publicações: a lista de grupos mostra o status REAL de cada uma, com a coluna Publicação', async () => {
    mockDetail({
      steps: [
        step({ id: 's1', order: 0, messageTemplate: 'Primeira' }),
        step({ id: 's2', order: 1, messageTemplate: 'Segunda' }),
      ],
      stepTargets: {
        s1: [stepTarget({ id: 't-s1', stepId: 's1', status: 'sent', sentAt: '2026-09-18T12:00:00.000Z' })],
        s2: [stepTarget({ id: 't-s2', stepId: 's2', status: 'pending' })],
      },
    });
    await renderPanel();

    const table = within(screen.getByTestId('group-broadcast-targets-table'));
    expect(table.getByText('Publicação')).toBeInTheDocument();
    expect(table.getByText('1 de 2')).toBeInTheDocument();
    expect(table.getByText('2 de 2')).toBeInTheDocument();
    expect(table.getByText('Publicado')).toBeInTheDocument();
    expect(table.getByText('Aguardando envio')).toBeInTheDocument();
  });

  it('publicação única: a lista de grupos não mostra a coluna Publicação', async () => {
    mockDetail();
    await renderPanel();

    const table = within(screen.getByTestId('group-broadcast-targets-table'));
    expect(table.queryByText('Publicação')).not.toBeInTheDocument();
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

describe('GroupBroadcastDetailPanel — editar e retomar-com-escolha (Task 9, 2026-09-15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouterQuery = {};
    (clientApi.fetchWhatsAppGroups as jest.Mock).mockResolvedValue({ groups: [] });
  });

  it('`?edit=1` na query abre o diálogo de edição sozinho e limpa a query', async () => {
    mockRouterQuery = { edit: '1' };
    mockDetail();
    await renderPanel();

    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'Editar disparo' })).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(mockRouterReplace).toHaveBeenCalled();
  });

  it('"Editar" abre o formulário de edição num draft/paused', async () => {
    mockDetail();
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.getByRole('heading', { name: 'Editar disparo' })).toBeInTheDocument();
  });

  it('num disparo RUNNING, o botão vira "Pausar e editar" e pede confirmação antes', async () => {
    mockDetail({ broadcast: { status: 'running' } });
    await renderPanel();

    const editButton = screen.getByRole('button', { name: 'Pausar e editar' });
    expect(screen.queryByRole('button', { name: /^editar$/i })).not.toBeInTheDocument();
    fireEvent.click(editButton);

    expect(screen.getByText('Pausar este disparo para editar?')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Editar disparo' })).not.toBeInTheDocument();
  });

  it('num disparo COMPLETED/CANCELLED, "Editar" fica desabilitado', async () => {
    mockDetail({ broadcast: { status: 'completed' } });
    await renderPanel();

    expect(screen.getByRole('button', { name: 'Editar' })).toBeDisabled();
  });

  it('diálogo de retomada só oferece a escolha quando alguma etapa ativa tem nextRunAt futuro', async () => {
    mockDetail({
      broadcast: { status: 'paused' },
      steps: [step({ nextRunAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() })],
    });
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /retomar envio/i }));

    expect(screen.getByText('Publicar agora')).toBeInTheDocument();
    expect(screen.getByText('Esperar o horário marcado')).toBeInTheDocument();
  });

  it('sem nenhuma etapa com nextRunAt futuro, o diálogo de retomada NÃO oferece a escolha', async () => {
    mockDetail({ broadcast: { status: 'paused' } });
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /retomar envio/i }));

    expect(screen.queryByText('Publicar agora')).not.toBeInTheDocument();
  });

  it('escolher "Publicar agora" chama start com resumeMode "now"', async () => {
    mockDetail({
      broadcast: { status: 'paused' },
      steps: [step({ nextRunAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() })],
    });
    await renderPanel();
    (clientApi.startGroupBroadcast as jest.Mock).mockResolvedValue({
      broadcast: broadcast({ status: 'running' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /retomar envio/i }));
    fireEvent.click(screen.getByText('Publicar agora'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e publicar' }));

    await waitFor(() =>
      expect(clientApi.startGroupBroadcast).toHaveBeenCalledWith('broadcast-1', 'now'),
    );
  });

  it('escolher "Esperar o horário marcado" chama start com resumeMode "scheduled"', async () => {
    mockDetail({
      broadcast: { status: 'paused' },
      steps: [step({ nextRunAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() })],
    });
    await renderPanel();
    (clientApi.startGroupBroadcast as jest.Mock).mockResolvedValue({
      broadcast: broadcast({ status: 'running' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /retomar envio/i }));
    fireEvent.click(screen.getByText('Esperar o horário marcado'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e publicar' }));

    await waitFor(() =>
      expect(clientApi.startGroupBroadcast).toHaveBeenCalledWith('broadcast-1', 'scheduled'),
    );
  });

});
