/**
 * Redesign 2026-08-26 — teste do `ConversationTagPicker`: além de
 * atribuir/remover tags de UMA conversa, o dropdown "+ Tag" agora também
 * gerencia o CATÁLOGO (criar/editar/remover tag), mesmo padrão já aplicado a
 * Respostas Rápidas em `MessageComposer.test.tsx` (2026-08-25). A `TagsPanel`
 * embutida tem sua própria suíte (`TagsPanel.test.tsx`) que cobre o CRUD em
 * detalhe — aqui o foco é a integração: abrir/fechar, alternar pro modo
 * gestão, voltar recarrega o catálogo de atribuição.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConversationTagPicker from '../../components/ConversationTagPicker';
import * as clientApi from '../../lib/clientApi';
import type { ConversationTagSummary } from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchTags: jest.fn(),
  createTag: jest.fn(),
  updateTag: jest.fn(),
  deleteTag: jest.fn(),
  assignConversationTag: jest.fn(),
  unassignConversationTag: jest.fn(),
}));

function tag(over: Partial<clientApi.Tag> = {}): clientApi.Tag {
  return {
    id: 'tag-1',
    tenantId: 'tenant-1',
    sessionName: 'vendas',
    name: 'VIP',
    color: 'green',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...over,
  };
}

const NO_TAGS_ASSIGNED: ConversationTagSummary[] = [];

describe('ConversationTagPicker — modo Gerenciar (Redesign 2026-08-26)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (clientApi.fetchTags as jest.Mock).mockResolvedValue({ tags: [tag()] });
  });

  it('mostra o botão "Cadastrar / gerenciar tags" na lista de atribuição', async () => {
    render(
      <ConversationTagPicker
        sessionName="vendas"
        conversationId="c1"
        tags={NO_TAGS_ASSIGNED}
        onChange={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Tag' }));

    await waitFor(() => expect(screen.getByText('VIP')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Cadastrar \/ gerenciar tags/ })).toBeInTheDocument();
  });

  it('clicar no botão de gestão troca para a TagsPanel embutida (com botão Voltar)', async () => {
    render(
      <ConversationTagPicker
        sessionName="vendas"
        conversationId="c1"
        tags={NO_TAGS_ASSIGNED}
        onChange={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Tag' }));
    await waitFor(() => expect(screen.getByText('VIP')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar \/ gerenciar tags/ }));

    expect(screen.getByText('Gerenciar tags')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Nome da tag')).toBeInTheDocument();
  });

  it('criar uma tag no modo gestão, depois voltar, mostra a tag na lista de atribuição', async () => {
    (clientApi.createTag as jest.Mock).mockResolvedValue({
      tag: tag({ id: 'tag-2', name: 'Urgente', color: 'red' }),
    });

    render(
      <ConversationTagPicker
        sessionName="vendas"
        conversationId="c1"
        tags={NO_TAGS_ASSIGNED}
        onChange={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Tag' }));
    await waitFor(() => expect(screen.getByText('VIP')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar \/ gerenciar tags/ }));

    fireEvent.change(screen.getByPlaceholderText('Nome da tag'), {
      target: { value: 'Urgente' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(clientApi.createTag).toHaveBeenCalledWith('vendas', 'Urgente', 'gray'));

    (clientApi.fetchTags as jest.Mock).mockResolvedValue({
      tags: [tag(), tag({ id: 'tag-2', name: 'Urgente', color: 'red' })],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    await waitFor(() => expect(screen.getByText('Urgente')).toBeInTheDocument());
  });

  it('fechar e reabrir o dropdown sempre volta pro modo de atribuição (nunca abre direto na gestão)', async () => {
    render(
      <ConversationTagPicker
        sessionName="vendas"
        conversationId="c1"
        tags={NO_TAGS_ASSIGNED}
        onChange={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Tag' }));
    await waitFor(() => expect(screen.getByText('VIP')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar \/ gerenciar tags/ }));
    expect(screen.getByText('Gerenciar tags')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+ Tag' })); // fecha
    fireEvent.click(screen.getByRole('button', { name: '+ Tag' })); // reabre

    await waitFor(() => expect(screen.getByText('VIP')).toBeInTheDocument());
    expect(screen.queryByText('Gerenciar tags')).not.toBeInTheDocument();
  });

  it('atribuir uma tag existente continua funcionando fora do modo gestão', async () => {
    const onChange = jest.fn();
    (clientApi.assignConversationTag as jest.Mock).mockResolvedValue(undefined);

    render(
      <ConversationTagPicker
        sessionName="vendas"
        conversationId="c1"
        tags={NO_TAGS_ASSIGNED}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Tag' }));
    await waitFor(() => expect(screen.getByText('VIP')).toBeInTheDocument());

    fireEvent.click(screen.getByText('VIP'));

    await waitFor(() => {
      expect(clientApi.assignConversationTag).toHaveBeenCalledWith('c1', 'tag-1');
    });
    expect(onChange).toHaveBeenCalledWith([{ id: 'tag-1', name: 'VIP', color: 'green' }]);
  });
});
