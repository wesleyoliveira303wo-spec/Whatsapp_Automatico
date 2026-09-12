/**
 * `GroupBroadcastCreateForm` — Disparos em grupos (2026-09-11): lista de
 * grupos ao vivo (busca + checkbox, "só admins" desabilita quem não pode
 * enviar), mensagem, anexo opcional, e um resultado explícito (nunca envia
 * nada — só cria e calcula).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import GroupBroadcastCreateForm from '../../components/GroupBroadcastCreateForm';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchWhatsAppGroups: jest.fn(),
  createGroupBroadcast: jest.fn(),
  attachGroupBroadcastMedia: jest.fn(),
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

describe('GroupBroadcastCreateForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carrega e lista os grupos, com participantes', async () => {
    (clientApi.fetchWhatsAppGroups as jest.Mock).mockResolvedValue({
      groups: [group()],
      fetchedAt: '2026-09-11T10:00:00.000Z',
    });

    render(<GroupBroadcastCreateForm sessionName="vendas" />);

    await waitFor(() => expect(screen.getByText('Grupo de clientes')).toBeInTheDocument());
    expect(screen.getByText('42 participantes')).toBeInTheDocument();
  });

  it('grupo "só admins" onde o número NÃO é admin: checkbox desabilitado', async () => {
    (clientApi.fetchWhatsAppGroups as jest.Mock).mockResolvedValue({
      groups: [group({ announce: true, isAdmin: false, canSend: false })],
      fetchedAt: '2026-09-11T10:00:00.000Z',
    });

    render(<GroupBroadcastCreateForm sessionName="vendas" />);

    await waitFor(() => expect(screen.getByText('Grupo de clientes')).toBeInTheDocument());
    expect(screen.getByText('Só admins')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Grupo/ })).toBeDisabled();
  });

  it('busca filtra os grupos pelo nome', async () => {
    (clientApi.fetchWhatsAppGroups as jest.Mock).mockResolvedValue({
      groups: [group({ jid: '1@g.us', name: 'Clientes VIP' }), group({ jid: '2@g.us', name: 'Fornecedores' })],
      fetchedAt: '2026-09-11T10:00:00.000Z',
    });

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

  it('exige nome, mensagem e ao menos um grupo para habilitar o botão de criar', async () => {
    (clientApi.fetchWhatsAppGroups as jest.Mock).mockResolvedValue({
      groups: [group()],
      fetchedAt: '2026-09-11T10:00:00.000Z',
    });

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

  it('cria o disparo e mostra o resultado (pendentes/suprimidos), sem enviar nada', async () => {
    (clientApi.fetchWhatsAppGroups as jest.Mock).mockResolvedValue({
      groups: [group()],
      fetchedAt: '2026-09-11T10:00:00.000Z',
    });
    (clientApi.createGroupBroadcast as jest.Mock).mockResolvedValue({
      broadcast: {
        id: 'broadcast-1',
        tenantId: 't1',
        sessionName: 'vendas',
        name: 'Disparo teste',
        messageTemplate: 'Olá!',
        status: 'draft',
        intervalSeconds: 60,
        createdAt: '2026-09-11T10:00:00.000Z',
        updatedAt: '2026-09-11T10:00:00.000Z',
      },
      summary: { total: 1, pending: 1, sent: 0, failed: 0, skipped: 0 },
      targets: [],
    });
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
      messageTemplate: 'Olá!',
      groupJids: ['111@g.us'],
    });
    expect(onCreated).toHaveBeenCalled();
  });

  it('mostra o motivo de erro ao falhar a criação', async () => {
    (clientApi.fetchWhatsAppGroups as jest.Mock).mockResolvedValue({
      groups: [group()],
      fetchedAt: '2026-09-11T10:00:00.000Z',
    });
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

describe('GroupBroadcastCreateForm — repetição (2026-09-11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (clientApi.fetchWhatsAppGroups as jest.Mock).mockResolvedValue({
      groups: [group()],
      fetchedAt: '2026-09-11T10:00:00.000Z',
    });
    (clientApi.createGroupBroadcast as jest.Mock).mockResolvedValue({
      broadcast: { id: 'b1', status: 'draft' },
      summary: { total: 1, pending: 1, sent: 0, failed: 0, skipped: 0 },
      targets: [],
    });
  });

  async function preencherBasico(): Promise<void> {
    render(<GroupBroadcastCreateForm sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Grupo de clientes')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Nome do disparo'), { target: { value: 'Disparo' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Olá!' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Grupo/ }));
  }

  it('desligada por padrão: nenhum campo de repetição aparece', async () => {
    await preencherBasico();

    expect(screen.queryByLabelText('Repetir a cada')).not.toBeInTheDocument();
  });

  it('ligada: publicação única deixa de ser enviada e a configuração vai no pedido', async () => {
    await preencherBasico();

    fireEvent.click(screen.getByRole('checkbox', { name: /Repetir automaticamente/ }));
    fireEvent.change(screen.getByLabelText('Repetir a cada'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Quantas repetições'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    await waitFor(() => expect(clientApi.createGroupBroadcast).toHaveBeenCalled());
    expect(clientApi.createGroupBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrenceIntervalHours: 3,
        recurrenceMaxRuns: 4,
        sendWindowStart: '08:00',
        sendWindowEnd: '20:00',
      }),
    );
  });

  it('"até eu cancelar": nenhum limite viaja no pedido, e o aviso aparece', async () => {
    await preencherBasico();

    fireEvent.click(screen.getByRole('checkbox', { name: /Repetir automaticamente/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Até eu cancelar' }));

    expect(screen.getByText(/continua publicando até você pausar ou cancelar/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));
    await waitFor(() => expect(clientApi.createGroupBroadcast).toHaveBeenCalled());
    const payload = (clientApi.createGroupBroadcast as jest.Mock).mock.calls[0][0];
    expect(payload.recurrenceMaxRuns).toBeUndefined();
    expect(payload.recurrenceEndsAt).toBeUndefined();
    expect(payload.recurrenceIntervalHours).toBe(2);
  });

  it('sem horário permitido marcado, a janela não é enviada', async () => {
    await preencherBasico();

    fireEvent.click(screen.getByRole('checkbox', { name: /Repetir automaticamente/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Só publicar dentro de um horário' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    await waitFor(() => expect(clientApi.createGroupBroadcast).toHaveBeenCalled());
    const payload = (clientApi.createGroupBroadcast as jest.Mock).mock.calls[0][0];
    expect(payload.sendWindowStart).toBeUndefined();
  });

  it('término por data sem data preenchida: não deixa criar', async () => {
    await preencherBasico();

    fireEvent.click(screen.getByRole('checkbox', { name: /Repetir automaticamente/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Uma data e hora de término' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo (rascunho)' }));

    expect(clientApi.createGroupBroadcast).not.toHaveBeenCalled();
  });
});
