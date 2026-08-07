/**
 * Fase 1, Bloco F1.9 — teste do `QuickRepliesPanel`: painel de gestão das
 * Respostas Rápidas de uma sessão (lista + criar + editar inline + remover),
 * mesma casca de `UserManagementPanel`/`AuditLogPanel`.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuickRepliesPanel from '../../components/QuickRepliesPanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchQuickReplies: jest.fn(),
  createQuickReply: jest.fn(),
  updateQuickReply: jest.fn(),
  deleteQuickReply: jest.fn(),
}));

function quickReply(over: Partial<clientApi.QuickReply> = {}): clientApi.QuickReply {
  return {
    id: 'qr-1',
    tenantId: 'tenant-1',
    sessionName: 'vendas',
    content: 'Bom dia! Como posso ajudar?',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...over,
  };
}

describe('QuickRepliesPanel (Fase 1, Bloco F1.9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carrega e lista as respostas ao montar', async () => {
    (clientApi.fetchQuickReplies as jest.Mock).mockResolvedValue({ quickReplies: [quickReply()] });

    render(<QuickRepliesPanel sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByText('Bom dia! Como posso ajudar?')).toBeInTheDocument();
    });
    expect(clientApi.fetchQuickReplies).toHaveBeenCalledWith('vendas');
  });

  it('mostra mensagem de lista vazia quando não há respostas', async () => {
    (clientApi.fetchQuickReplies as jest.Mock).mockResolvedValue({ quickReplies: [] });

    render(<QuickRepliesPanel sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByText('Nenhuma resposta rápida cadastrada ainda.')).toBeInTheDocument();
    });
  });

  it('cria uma nova resposta ao submeter o formulário', async () => {
    (clientApi.fetchQuickReplies as jest.Mock).mockResolvedValue({ quickReplies: [] });
    (clientApi.createQuickReply as jest.Mock).mockResolvedValue({
      quickReply: quickReply({ content: 'Obrigado pelo contato!' }),
    });

    render(<QuickRepliesPanel sessionName="vendas" />);
    await waitFor(() => expect(clientApi.fetchQuickReplies).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Nova resposta rápida'), {
      target: { value: 'Obrigado pelo contato!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => {
      expect(clientApi.createQuickReply).toHaveBeenCalledWith('vendas', 'Obrigado pelo contato!');
    });
    expect(await screen.findByText('Obrigado pelo contato!')).toBeInTheDocument();
  });

  it('edita uma resposta existente (inline) e salva', async () => {
    (clientApi.fetchQuickReplies as jest.Mock).mockResolvedValue({ quickReplies: [quickReply()] });
    (clientApi.updateQuickReply as jest.Mock).mockResolvedValue({
      quickReply: quickReply({ content: 'Texto atualizado' }),
    });

    render(<QuickRepliesPanel sessionName="vendas" />);
    await waitFor(() =>
      expect(screen.getByText('Bom dia! Como posso ajudar?')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const textarea = screen.getByDisplayValue('Bom dia! Como posso ajudar?');
    fireEvent.change(textarea, { target: { value: 'Texto atualizado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(clientApi.updateQuickReply).toHaveBeenCalledWith('vendas', 'qr-1', 'Texto atualizado');
    });
    expect(await screen.findByText('Texto atualizado')).toBeInTheDocument();
  });

  it('cancelar a edição não chama updateQuickReply e mantém o texto original', async () => {
    (clientApi.fetchQuickReplies as jest.Mock).mockResolvedValue({ quickReplies: [quickReply()] });

    render(<QuickRepliesPanel sessionName="vendas" />);
    await waitFor(() =>
      expect(screen.getByText('Bom dia! Como posso ajudar?')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(clientApi.updateQuickReply).not.toHaveBeenCalled();
    expect(screen.getByText('Bom dia! Como posso ajudar?')).toBeInTheDocument();
  });

  it('remove uma resposta ao clicar em Excluir', async () => {
    (clientApi.fetchQuickReplies as jest.Mock).mockResolvedValue({ quickReplies: [quickReply()] });
    (clientApi.deleteQuickReply as jest.Mock).mockResolvedValue(undefined);

    render(<QuickRepliesPanel sessionName="vendas" />);
    await waitFor(() =>
      expect(screen.getByText('Bom dia! Como posso ajudar?')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => {
      expect(clientApi.deleteQuickReply).toHaveBeenCalledWith('vendas', 'qr-1');
    });
    await waitFor(() => {
      expect(screen.queryByText('Bom dia! Como posso ajudar?')).not.toBeInTheDocument();
    });
  });

  it('mostra mensagem de erro amigável em caso de 403 ao criar', async () => {
    const { ClientApiError } = jest.requireActual('../../lib/clientApi');
    (clientApi.fetchQuickReplies as jest.Mock).mockResolvedValue({ quickReplies: [] });
    (clientApi.createQuickReply as jest.Mock).mockRejectedValue(
      new ClientApiError(403, { error: 'forbidden' }),
    );

    render(<QuickRepliesPanel sessionName="vendas" />);
    await waitFor(() => expect(clientApi.fetchQuickReplies).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Nova resposta rápida'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => {
      expect(
        screen.getByText('Seu cargo não permite gerenciar respostas rápidas.'),
      ).toBeInTheDocument();
    });
  });
});
