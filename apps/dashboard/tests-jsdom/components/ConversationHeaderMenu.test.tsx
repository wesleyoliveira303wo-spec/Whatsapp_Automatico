/**
 * Menu "⋮" da conversa (2026-08-29) — substitui o antigo botão isolado de
 * "Atualizar" no cabeçalho da conversa por um menu único com 8 ações.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConversationHeaderMenu from '../../components/ConversationHeaderMenu';
import * as clientApi from '../../lib/clientApi';
import type { ConversationSummary } from '../../lib/clientApi';

const push = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  markConversationAsUnread: jest.fn(),
  archiveConversation: jest.fn(),
  deleteConversation: jest.fn(),
  updateConversationStage: jest.fn(),
  setConversationExcludedFromPipeline: jest.fn(),
}));

jest.mock('../../hooks/useTags', () => ({
  useTags: () => ({ tags: [], loading: false, refresh: jest.fn() }),
}));

function buildConversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'conv-1',
    tenantId: 'tenant-1',
    sessionName: 'sessao-1',
    contactJid: '5521999999999@s.whatsapp.net',
    contactName: 'Cliente Teste',
    status: 'bot',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: new Date().toISOString(),
    excludedFromPipeline: false,
    archived: false,
    tags: [],
    aiSummaryMessageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ConversationHeaderMenu', () => {
  beforeEach(() => {
    push.mockClear();
    (clientApi.markConversationAsUnread as jest.Mock).mockReset();
    (clientApi.archiveConversation as jest.Mock).mockReset();
    (clientApi.deleteConversation as jest.Mock).mockReset();
    (clientApi.updateConversationStage as jest.Mock).mockReset();
    (clientApi.setConversationExcludedFromPipeline as jest.Mock).mockReset();
  });

  it('abre o menu e mostra os 8 itens esperados', () => {
    render(
      <ConversationHeaderMenu
        conversation={buildConversation()}
        sessionName="sessao-1"
        onUpdated={() => {}}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));

    expect(screen.getByRole('menuitem', { name: 'Atualizar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Marcar como não lida' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Adicionar Etiqueta' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Salvar Contato' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Mudar estágio da pipeline' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Ativar Não Cliente' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Arquivar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toBeInTheDocument();
  });

  it('"Atualizar" chama onRefresh, sem abrir diálogo nenhum', () => {
    const onRefresh = jest.fn();
    render(
      <ConversationHeaderMenu
        conversation={buildConversation()}
        sessionName="sessao-1"
        onUpdated={() => {}}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Atualizar' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('"Marcar como não lida" chama a API e propaga a conversa atualizada', async () => {
    const onUpdated = jest.fn();
    const updated = buildConversation({ unreadCount: 1 });
    (clientApi.markConversationAsUnread as jest.Mock).mockResolvedValue(updated);

    render(
      <ConversationHeaderMenu
        conversation={buildConversation()}
        sessionName="sessao-1"
        onUpdated={onUpdated}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Marcar como não lida' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
  });

  it('"Mudar estágio da pipeline" mostra os 5 estágios e chama a API ao escolher um', async () => {
    const onUpdated = jest.fn();
    const updated = buildConversation({ stage: 'contacted' });
    (clientApi.updateConversationStage as jest.Mock).mockResolvedValue(updated);

    render(
      <ConversationHeaderMenu
        conversation={buildConversation()}
        sessionName="sessao-1"
        onUpdated={onUpdated}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    // Submenu do Radix (`DropdownMenuSubTrigger`) abre no `onClick` imediatamente;
    // `onPointerMove` (hover) só abriria depois de um setTimeout(100ms) interno —
    // usar `click` aqui evita depender desse timer no teste.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mudar estágio da pipeline' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Contatado' }));

    await waitFor(() =>
      expect(clientApi.updateConversationStage).toHaveBeenCalledWith('conv-1', 'contacted'),
    );
    expect(onUpdated).toHaveBeenCalledWith(updated);
  });

  it('"Ativar Não Cliente" pede confirmação, explica o efeito, e chama a API ao confirmar', async () => {
    const onUpdated = jest.fn();
    const updated = buildConversation({ excludedFromPipeline: true });
    (clientApi.setConversationExcludedFromPipeline as jest.Mock).mockResolvedValue(updated);

    render(
      <ConversationHeaderMenu
        conversation={buildConversation()}
        sessionName="sessao-1"
        onUpdated={onUpdated}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ativar Não Cliente' }));

    // O diálogo abre num setTimeout(0) (evita a briga de foco DropdownMenu x
    // Dialog — ver docstring do componente), então precisa de waitFor aqui.
    await waitFor(() =>
      expect(screen.getByText(/coluna "Não cliente" do Pipeline/i)).toBeInTheDocument(),
    );
    expect(clientApi.setConversationExcludedFromPipeline).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(clientApi.setConversationExcludedFromPipeline).toHaveBeenCalledWith('conv-1', true),
    );
    expect(onUpdated).toHaveBeenCalledWith(updated);
  });

  it('"Arquivar" pede confirmação e chama a API ao confirmar', async () => {
    const onUpdated = jest.fn();
    const updated = buildConversation({ archived: true });
    (clientApi.archiveConversation as jest.Mock).mockResolvedValue(updated);

    render(
      <ConversationHeaderMenu
        conversation={buildConversation()}
        sessionName="sessao-1"
        onUpdated={onUpdated}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Arquivar' }));

    const confirmButton = await screen.findByRole('button', { name: 'Confirmar' });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(clientApi.archiveConversation).toHaveBeenCalledWith('conv-1', true));
    expect(onUpdated).toHaveBeenCalledWith(updated);
  });

  it('"Excluir": botão de confirmar fica desabilitado até digitar o nome do contato', async () => {
    render(
      <ConversationHeaderMenu
        conversation={buildConversation({ contactName: 'Cliente Teste' })}
        sessionName="sessao-1"
        onUpdated={() => {}}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));

    const confirmButton = await screen.findByRole('button', { name: 'Excluir definitivamente' });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/digite.*Cliente Teste/i), {
      target: { value: 'Cliente Teste' },
    });
    expect(confirmButton).not.toBeDisabled();
  });

  it('"Excluir" confirmado: chama a API e redireciona para a lista de conversas', async () => {
    (clientApi.deleteConversation as jest.Mock).mockResolvedValue(undefined);

    render(
      <ConversationHeaderMenu
        conversation={buildConversation({ contactName: 'Cliente Teste' })}
        sessionName="sessao-1"
        onUpdated={() => {}}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));

    const confirmButton = await screen.findByRole('button', { name: 'Excluir definitivamente' });
    fireEvent.change(screen.getByLabelText(/digite.*Cliente Teste/i), {
      target: { value: 'Cliente Teste' },
    });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(clientApi.deleteConversation).toHaveBeenCalledWith('conv-1'));
    expect(push).toHaveBeenCalledWith(`/sessions/${encodeURIComponent('sessao-1')}/conversations`);
  });
});
