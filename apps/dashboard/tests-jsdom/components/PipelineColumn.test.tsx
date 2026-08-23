/**
 * Pipeline de CRM (Milestone 6, Bloco M6H-5) — teste do `PipelineColumn`.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PipelineColumn from '../../components/PipelineColumn';
import * as clientApi from '../../lib/clientApi';
import type { ConversationSummary } from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchContactAvatar: jest.fn(),
}));

beforeEach(() => {
  (clientApi.fetchContactAvatar as jest.Mock)
    .mockReset()
    .mockResolvedValue({ avatarUrl: undefined });
});

function buildConversation(
  id: string,
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id,
    tenantId: 't1',
    sessionName: 'vendas',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'bot',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: '2026-07-30T09:00:00.000Z',
    excludedFromPipeline: false,
    tags: [],
    createdAt: '2026-07-30T09:00:00.000Z',
    updatedAt: '2026-07-30T09:00:00.000Z',
    ...overrides,
  };
}

describe('PipelineColumn (pipeline de CRM, Milestone 6, Bloco M6H-5)', () => {
  it('renderiza o rótulo do estágio e a contagem', () => {
    render(
      <PipelineColumn
        column="new"
        conversations={[buildConversation('a'), buildConversation('b')]}
        draggedId={null}
        onDragStart={jest.fn()}
        onDragEnd={jest.fn()}
        onDropOnColumn={jest.fn()}
        dragOver={false}
        onDragEnterColumn={jest.fn()}
        onMoveCard={jest.fn()}
      />,
    );
    expect(screen.getByText('Novo')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('reskin 2026-08-07 (Design System): ponto do cabeçalho usa a cor certa por estágio', () => {
    const { container, rerender } = render(
      <PipelineColumn
        column="negotiating"
        conversations={[]}
        draggedId={null}
        onDragStart={jest.fn()}
        onDragEnd={jest.fn()}
        onDropOnColumn={jest.fn()}
        dragOver={false}
        onDragEnterColumn={jest.fn()}
        onMoveCard={jest.fn()}
      />,
    );
    expect(container.querySelector('.bg-warning')).toBeInTheDocument();

    rerender(
      <PipelineColumn
        column="closed_won"
        conversations={[]}
        draggedId={null}
        onDragStart={jest.fn()}
        onDragEnd={jest.fn()}
        onDropOnColumn={jest.fn()}
        dragOver={false}
        onDragEnterColumn={jest.fn()}
        onMoveCard={jest.fn()}
      />,
    );
    expect(container.querySelector('.bg-success')).toBeInTheDocument();
  });

  it('mostra mensagem de coluna vazia quando não há conversas', () => {
    render(
      <PipelineColumn
        column="contacted"
        conversations={[]}
        draggedId={null}
        onDragStart={jest.fn()}
        onDragEnd={jest.fn()}
        onDropOnColumn={jest.fn()}
        dragOver={false}
        onDragEnterColumn={jest.fn()}
        onMoveCard={jest.fn()}
      />,
    );
    expect(screen.getByText('Nenhum card aqui')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('realça a coluna quando dragOver=true', () => {
    const { container } = render(
      <PipelineColumn
        column="negotiating"
        conversations={[]}
        draggedId={null}
        onDragStart={jest.fn()}
        onDragEnd={jest.fn()}
        onDropOnColumn={jest.fn()}
        dragOver
        onDragEnterColumn={jest.fn()}
        onMoveCard={jest.fn()}
      />,
    );
    expect(container.firstChild).toHaveClass('border-primary');
  });

  describe('coluna "Não cliente" (ADR #96)', () => {
    it('rotula a coluna derivada', () => {
      render(
        <PipelineColumn
          column="not_client"
          conversations={[buildConversation('a', { excludedFromPipeline: true })]}
          draggedId={null}
          onDragStart={jest.fn()}
          onDragEnd={jest.fn()}
          onDropOnColumn={jest.fn()}
          dragOver={false}
          onDragEnterColumn={jest.fn()}
          onMoveCard={jest.fn()}
        />,
      );
      expect(screen.getByText('Não cliente')).toBeInTheDocument();
    });

    it('reskin 2026-08-07 (Design System): borda tracejada e fundo transparente, sem o aviso de "IA desligada" no cabeçalho (o mockup avisa só no card, ver PipelineCard)', () => {
      const { container } = render(
        <PipelineColumn
          column="not_client"
          conversations={[]}
          draggedId={null}
          onDragStart={jest.fn()}
          onDragEnd={jest.fn()}
          onDropOnColumn={jest.fn()}
          dragOver={false}
          onDragEnterColumn={jest.fn()}
          onMoveCard={jest.fn()}
        />,
      );
      expect(container.firstChild).toHaveClass('border-dashed', 'bg-transparent');
      expect(screen.queryByText('A IA não responde nesta coluna')).not.toBeInTheDocument();
    });

    it('reporta a própria chave ao receber um drop (o board decide o que gravar)', () => {
      const onDropOnColumn = jest.fn();
      const { container } = render(
        <PipelineColumn
          column="not_client"
          conversations={[]}
          draggedId="a"
          onDragStart={jest.fn()}
          onDragEnd={jest.fn()}
          onDropOnColumn={onDropOnColumn}
          dragOver={false}
          onDragEnterColumn={jest.fn()}
          onMoveCard={jest.fn()}
        />,
      );

      fireEvent.drop(container.firstChild as Element);

      expect(onDropOnColumn).toHaveBeenCalledWith('not_client');
    });
  });

  it('repassa o id da conversa certa ao mover um card pelo select (alternativa por teclado, auditoria 2026-08-22)', () => {
    const onMoveCard = jest.fn();
    render(
      <PipelineColumn
        column="new"
        conversations={[buildConversation('a'), buildConversation('b')]}
        draggedId={null}
        onDragStart={jest.fn()}
        onDragEnd={jest.fn()}
        onDropOnColumn={jest.fn()}
        dragOver={false}
        onDragEnterColumn={jest.fn()}
        onMoveCard={onMoveCard}
      />,
    );
    const selects = screen.getAllByRole('combobox', {
      name: 'Mover conversa para outro estágio do Pipeline',
    });
    fireEvent.change(selects[1], { target: { value: 'negotiating' } });
    expect(onMoveCard).toHaveBeenCalledWith('b', 'negotiating');
  });
});
