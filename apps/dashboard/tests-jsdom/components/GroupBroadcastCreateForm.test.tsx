/**
 * `GroupBroadcastCreateForm` — Disparos em grupos (2026-09-11), estendido em
 * 2026-09-14 para campanhas com múltiplas publicações em sequência
 * ("etapas"): lista de grupos ao vivo (busca + checkbox, "só admins"
 * desabilita quem não pode enviar), seção "Publicações" (adicionar/remover/
 * reordenar, mínimo 1 máximo 20, cada uma com sua mensagem/anexo/recorrência
 * própria), e um resultado explícito (nunca envia nada — só cria e calcula).
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import GroupBroadcastCreateForm from '../../components/GroupBroadcastCreateForm';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchWhatsAppGroups: jest.fn(),
  createGroupBroadcast: jest.fn(),
  updateGroupBroadcast: jest.fn(),
  attachGroupBroadcastStepMedia: jest.fn(),
}));

jest.mock('../../components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

function group(over: Partial<clientApi.WhatsAppGroupSummary> = {}): clientApi.WhatsAppGroupSummary {
  return {
    jid: '111@g.us',
    name: 'Grupo de clientes',
    participantCount: 42,
    announce: false,
    isAdmin: true,
    canSend: true,
    ...over,
  };
}

function mockGroups(groups: clientApi.WhatsAppGroupSummary[] = [group()]): void {
  (clientApi.fetchWhatsAppGroups as jest.Mock).mockResolvedValue({
    groups,
    fetchedAt: '2026-09-11T10:00:00.000Z',
  });
}

function mockCreateSuccess(stepCount = 1): void {
  (clientApi.createGroupBroadcast as jest.Mock).mockResolvedValue({
    broadcast: {
      id: 'broadcast-1',
      tenantId: 't1',
      sessionName: 'vendas',
      name: 'Disparo teste',
      status: 'draft',
      intervalSeconds: 60,
      currentStepIndex: 0,
      createdAt: '2026-09-11T10:00:00.000Z',
      updatedAt: '2026-09-11T10:00:00.000Z',
    },
    steps: Array.from({ length: stepCount }, (_, index) => ({
      id: `step-${index + 1}`,
      broadcastId: 'broadcast-1',
      order: index,
      messageTemplate: `Publicação ${index + 1}`,
      runsCompleted: 0,
      createdAt: '2026-09-11T10:00:00.000Z',
    })),
    summary: { total: 1, pending: 1, sent: 0, failed: 0, skipped: 0, totalSent: 0 },
    targets: [],
  });
}

describe('GroupBroadcastCreateForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carrega e lista os grupos, com participantes', async () => {
    mockGroups();
    render(<GroupBroadcastCreateForm sessionName="vendas" />);

    await waitFor(() => expect(screen.getByText('Grupo de clientes')).toBeInTheDocument());
    expect(screen.getByText('42 participantes')).toBeInTheDocument();
  });

  it('grupo "só admins" onde o número NÃO é admin: checkbox desabilitado', async () => {
    mockGroups([group({ announce: true, isAdmin: false, canSend: false })]);
    render(<GroupBroadcastCreateForm sessionName="vendas" />);

    await waitFor(() => expect(screen.getByText('Grupo de clientes')).toBeInTheDocument());
    expect(screen.getByText('Só admins')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Grupo/ })).toBeDisabled();
  });

  it('busca filtra os grupos pelo nome', async () => {
    mockGroups([
      group({ jid: '1@g.us', name: 'Clientes VIP' }),
      group({ jid: '2@g.us', name: 'Fornecedores' }),
    ]);

    render(<GroupBroadcastCreateForm sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Clientes VIP')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Buscar grupo por nome…'), {
      target: { value: 'forne' },
    });

    expect(screen.queryByText('Clientes VIP')).not.toBeInTheDocument();
    expect(screen.getByText('Fornecedores')).toBeInTheDocument();
  });

  it('WhatsApp desconectado: mostra a mensagem de erro, não uma lista vazia', async () => {
    (clientApi.fetchWhatsAppGroups as jest.Mock).mockRejectedValue(
      new clientApi.ClientApiError(409, { error: 'whatsapp_not_connected' }),
    );

    render(<GroupBroadcastCreateForm sessionName="vendas" />);

    await waitFor(() =>
      expect(
        screen.getByText('Este WhatsApp não está conectado — conecte para ver os grupos.'),
      ).toBeInTheDocument(),
    );
  });

  it('exige nome, mensagem da publicação e ao menos um grupo para habilitar o botão de criar', async () => {
    mockGroups();
    render(<GroupBroadcastCreateForm sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Grupo de clientes')).toBeInTheDocument());

    const submit = screen.getByRole('button', { name: 'Criar disparo (rascunho)' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Nome do disparo'), {
      target: { value: 'Disparo teste' },
    });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Olá!' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Grupo/ }));

    expect(submit).not.toBeDisabled();
  });

  it('cria o disparo (com 1 publicação) e mostra o resultado, sem enviar nada', async () => {
    mockGroups();
    mockCreateSuccess();
    const onCreated = jest.fn();

    render(<GroupBroadcastCreateForm sessionName="vendas" onCreated={onCreated} />);
    await waitFor(() => expect(screen.getByText('Grupo de clientes')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Nome do disparo'), {
      target: { value: 'Disparo teste' },
    });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Olá!' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Grupo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    await waitFor(() => expect(screen.getByText('Disparo criado')).toBeInTheDocument());
    expect(screen.getByText(/nenhuma mensagem foi enviada ainda/i)).toBeInTheDocument();
    expect(clientApi.createGroupBroadcast).toHaveBeenCalledWith({
      sessionName: 'vendas',
      name: 'Disparo teste',
      groupJids: ['111@g.us'],
      steps: [{ messageTemplate: 'Olá!' }],
    });
    expect(onCreated).toHaveBeenCalled();
  });

  it('mostra o motivo de erro ao falhar a criação', async () => {
    mockGroups();
    (clientApi.createGroupBroadcast as jest.Mock).mockRejectedValue(
      new clientApi.ClientApiError(403, {}),
    );

    render(<GroupBroadcastCreateForm sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Grupo de clientes')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Nome do disparo'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Y' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Grupo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    await waitFor(() =>
      expect(
        screen.getByText('Seu cargo não permite criar disparos em grupos.'),
      ).toBeInTheDocument(),
    );
  });
});

describe('GroupBroadcastCreateForm — múltiplas publicações (2026-09-14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroups();
  });

  async function preencherBasico(): Promise<void> {
    render(<GroupBroadcastCreateForm sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Grupo de clientes')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Nome do disparo'), { target: { value: 'Disparo' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Primeira' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Grupo/ }));
  }

  it('começa com 1 publicação, e "Remover" fica desabilitado (mínimo 1)', async () => {
    await preencherBasico();

    expect(screen.getByText('Publicação 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover publicação 1' })).toBeDisabled();
  });

  it('"Adicionar publicação" cria uma segunda etapa, cada uma com sua própria mensagem', async () => {
    await preencherBasico();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar publicação' }));

    expect(screen.getByText('Publicação 2')).toBeInTheDocument();
    const messageInputs = screen.getAllByLabelText('Mensagem');
    expect(messageInputs).toHaveLength(2);
    fireEvent.change(messageInputs[1], { target: { value: 'Segunda' } });

    mockCreateSuccess(2);
    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    await waitFor(() => expect(clientApi.createGroupBroadcast).toHaveBeenCalled());
    const payload = (clientApi.createGroupBroadcast as jest.Mock).mock.calls[0][0];
    expect(payload.steps).toEqual([
      { messageTemplate: 'Primeira' },
      { messageTemplate: 'Segunda' },
    ]);
  });

  it('teto de 20 publicações: o botão "Adicionar publicação" desabilita ao chegar no limite', async () => {
    await preencherBasico();

    for (let i = 0; i < 19; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar publicação' }));
    }

    expect(screen.getByText('(20 de 20)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar publicação' })).toBeDisabled();
  });

  it('"Remover publicação" some com a etapa correspondente', async () => {
    await preencherBasico();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar publicação' }));
    const messageInputs = screen.getAllByLabelText('Mensagem');
    fireEvent.change(messageInputs[1], { target: { value: 'Segunda' } });

    fireEvent.click(screen.getByRole('button', { name: 'Remover publicação 1' }));

    expect(screen.getAllByLabelText('Mensagem')).toHaveLength(1);
    expect(screen.getByDisplayValue('Segunda')).toBeInTheDocument();
  });

  it('reordenar com as setas troca a ordem das publicações no pedido de criação', async () => {
    await preencherBasico();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar publicação' }));
    fireEvent.change(screen.getAllByLabelText('Mensagem')[1], { target: { value: 'Segunda' } });

    // Move a 2ª publicação (índice 1) para cima — vira a 1ª.
    fireEvent.click(screen.getByRole('button', { name: 'Mover publicação 2 para cima' }));

    mockCreateSuccess(2);
    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    await waitFor(() => expect(clientApi.createGroupBroadcast).toHaveBeenCalled());
    const payload = (clientApi.createGroupBroadcast as jest.Mock).mock.calls[0][0];
    expect(payload.steps).toEqual([
      { messageTemplate: 'Segunda' },
      { messageTemplate: 'Primeira' },
    ]);
  });

  it('cada publicação tem sua própria recorrência, independente das demais', async () => {
    await preencherBasico();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar publicação' }));
    fireEvent.change(screen.getAllByLabelText('Mensagem')[1], { target: { value: 'Segunda' } });

    const cards = screen.getAllByText(/^Publicação \d$/).map((el) => el.closest('div')!.parentElement!);
    // Liga a recorrência só na 1ª publicação.
    fireEvent.click(within(cards[0]).getByRole('checkbox', { name: /Repetir esta publicação/ }));
    fireEvent.change(within(cards[0]).getByLabelText('Repetir a cada'), { target: { value: '3' } });
    fireEvent.change(within(cards[0]).getByLabelText('Quantas repetições'), {
      target: { value: '4' },
    });

    mockCreateSuccess(2);
    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    await waitFor(() => expect(clientApi.createGroupBroadcast).toHaveBeenCalled());
    const payload = (clientApi.createGroupBroadcast as jest.Mock).mock.calls[0][0];
    expect(payload.steps).toEqual([
      { messageTemplate: 'Primeira', recurrenceIntervalHours: 3, recurrenceMaxRuns: 4 },
      { messageTemplate: 'Segunda' },
    ]);
  });

  it('sem horário permitido marcado, a janela não é enviada', async () => {
    await preencherBasico();
    mockCreateSuccess();
    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    await waitFor(() => expect(clientApi.createGroupBroadcast).toHaveBeenCalled());
    const payload = (clientApi.createGroupBroadcast as jest.Mock).mock.calls[0][0];
    expect(payload.sendWindowStart).toBeUndefined();
  });

  it('horário permitido marcado: a janela vai no pedido, vale para a campanha inteira', async () => {
    await preencherBasico();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Só publicar dentro de um horário' }));
    mockCreateSuccess();
    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    await waitFor(() => expect(clientApi.createGroupBroadcast).toHaveBeenCalled());
    expect(clientApi.createGroupBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ sendWindowStart: '08:00', sendWindowEnd: '20:00' }),
    );
  });

  it('término por data sem data preenchida: não deixa criar', async () => {
    await preencherBasico();

    fireEvent.click(screen.getByRole('checkbox', { name: /Repetir esta publicação/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Uma data e hora de término' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    expect(clientApi.createGroupBroadcast).not.toHaveBeenCalled();
  });

  it('campo de cadência entre publicações fica DESABILITADO com só 1 publicação, e o valor vai no pedido ao ativar', async () => {
    await preencherBasico();
    expect(screen.getByLabelText('Cadência entre publicações')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar publicação' }));
    fireEvent.change(screen.getAllByLabelText('Mensagem')[1], { target: { value: 'Segunda' } });
    fireEvent.change(screen.getByLabelText('Cadência entre publicações'), { target: { value: '15' } });

    mockCreateSuccess(2);
    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    await waitFor(() => expect(clientApi.createGroupBroadcast).toHaveBeenCalled());
    expect(clientApi.createGroupBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ stepLaunchOffsetMinutes: 15 }),
    );
  });

  it('sem cadência preenchida (0/padrão): o campo não vai no pedido', async () => {
    await preencherBasico();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar publicação' }));
    fireEvent.change(screen.getAllByLabelText('Mensagem')[1], { target: { value: 'Segunda' } });

    mockCreateSuccess(2);
    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    await waitFor(() => expect(clientApi.createGroupBroadcast).toHaveBeenCalled());
    const payload = (clientApi.createGroupBroadcast as jest.Mock).mock.calls[0][0];
    expect(payload.stepLaunchOffsetMinutes).toBeUndefined();
  });

  it('anexo de mídia é enviado por etapa, após a criação (usando o id real da etapa criada)', async () => {
    await preencherBasico();
    mockCreateSuccess();
    (clientApi.attachGroupBroadcastStepMedia as jest.Mock).mockResolvedValue({
      step: { id: 'step-1' },
    });

    const file = new File(['conteudo'], 'promo.png', { type: 'image/png' });
    fireEvent.click(screen.getByRole('button', { name: 'Anexar arquivo' }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    await waitFor(() =>
      expect(clientApi.attachGroupBroadcastStepMedia).toHaveBeenCalledWith(
        'broadcast-1',
        'step-1',
        file,
        'image',
      ),
    );
  });
});

describe('GroupBroadcastCreateForm — modo edição (Task 8, 2026-09-15)', () => {
  const EDITING = {
    broadcast: {
      id: 'broadcast-1',
      tenantId: 't1',
      sessionName: 'vendas',
      name: 'Disparo existente',
      status: 'paused' as const,
      intervalSeconds: 60,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    steps: [
      {
        id: 'step-1',
        broadcastId: 'broadcast-1',
        order: 0,
        messageTemplate: 'Texto já cadastrado',
        runsCompleted: 3,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    targets: [
      {
        id: 'target-1',
        broadcastId: 'broadcast-1',
        groupJid: '111@g.us',
        groupName: 'Grupo de clientes',
        status: 'pending' as const,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'target-2',
        broadcastId: 'broadcast-1',
        groupJid: '999@g.us',
        groupName: 'Grupo Que Saiu',
        status: 'pending' as const,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGroups(); // só '111@g.us' está na listagem ao vivo — '999@g.us' vira indisponível.
  });

  it('nasce preenchido com nome, grupos e texto da publicação já existentes', async () => {
    render(<GroupBroadcastCreateForm sessionName="vendas" editing={EDITING as never} />);

    await waitFor(() => expect(clientApi.fetchWhatsAppGroups).toHaveBeenCalled());
    expect(screen.getByDisplayValue('Disparo existente')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Texto já cadastrado')).toBeInTheDocument();
  });

  it('grupo selecionado que não está mais na listagem ao vivo aparece marcado como indisponível', async () => {
    render(<GroupBroadcastCreateForm sessionName="vendas" editing={EDITING as never} />);

    await waitFor(() => expect(screen.getByText('Grupo Que Saiu')).toBeInTheDocument());
    expect(screen.getByText('Indisponível')).toBeInTheDocument();
  });

  it('mostra quantas vezes a publicação já rodou', async () => {
    render(<GroupBroadcastCreateForm sessionName="vendas" editing={EDITING as never} />);

    await waitFor(() => expect(screen.getByText('publicou 3x')).toBeInTheDocument());
  });

  it('salvar chama updateGroupBroadcast com o payload esperado (id da etapa preservado)', async () => {
    (clientApi.updateGroupBroadcast as jest.Mock).mockResolvedValue({
      broadcast: EDITING.broadcast,
      steps: EDITING.steps,
      summary: { total: 2, pending: 2, sent: 0, failed: 0, skipped: 0, totalSent: 3 },
      targets: EDITING.targets,
    });

    render(<GroupBroadcastCreateForm sessionName="vendas" editing={EDITING as never} />);
    await waitFor(() => expect(screen.getByText('Grupo Que Saiu')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(clientApi.updateGroupBroadcast).toHaveBeenCalledTimes(1));
    const [broadcastId, payload] = (clientApi.updateGroupBroadcast as jest.Mock).mock.calls[0];
    expect(broadcastId).toBe('broadcast-1');
    expect(payload.name).toBe('Disparo existente');
    expect(payload.groupJids.sort()).toEqual(['111@g.us', '999@g.us']);
    expect(payload.steps).toEqual([{ id: 'step-1', messageTemplate: 'Texto já cadastrado' }]);

    expect(clientApi.createGroupBroadcast).not.toHaveBeenCalled();
    expect(await screen.findByText('Alterações salvas')).toBeInTheDocument();
  });
});
