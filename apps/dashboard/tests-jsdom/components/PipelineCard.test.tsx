/**
 * Pipeline de CRM (Milestone 6, Bloco M6H-5) — teste do `PipelineCard`.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PipelineCard from '../../components/PipelineCard';
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

function buildConversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'c1',
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

describe('PipelineCard (pipeline de CRM, Milestone 6, Bloco M6H-5)', () => {
  it('renderiza o contato e o link para a conversa', () => {
    render(
      <PipelineCard
        conversation={buildConversation()}
        onDragStart={jest.fn()}
        onDragEnd={jest.fn()}
        onMoveToColumn={jest.fn()}
      />,
    );
    expect(screen.getByText('+55 11 99999-9999')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver conversa' })).toHaveAttribute(
      'href',
      '/sessions/vendas/conversations/c1',
    );
  });

  it('mostra o marcador de IA quando stageSetBy é ai', () => {
    render(
      <PipelineCard
        conversation={buildConversation({ stageSetBy: 'ai' })}
        onDragStart={jest.fn()}
        onDragEnd={jest.fn()}
        onMoveToColumn={jest.fn()}
      />,
    );
    expect(screen.getByTitle('Classificado pela IA')).toBeInTheDocument();
  });

  it('mostra o marcador de humano quando stageSetBy é human', () => {
    render(
      <PipelineCard
        conversation={buildConversation({ stageSetBy: 'human' })}
        onDragStart={jest.fn()}
        onDragEnd={jest.fn()}
        onMoveToColumn={jest.fn()}
      />,
    );
    expect(screen.getByTitle('Classificado por humano')).toBeInTheDocument();
  });

  it('ADR #89: card ajustado por humano NÃO exibe mais aviso de trava nem botão de destravar (a trava deixou de existir)', () => {
    render(
      <PipelineCard
        conversation={buildConversation({ stageSetBy: 'human' })}
        onDragStart={jest.fn()}
        onDragEnd={jest.fn()}
        onMoveToColumn={jest.fn()}
      />,
    );
    expect(screen.queryByText(/não classifica mais/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Devolver à IA/ })).not.toBeInTheDocument();
  });

  it('aplica opacidade reduzida quando dragging=true', () => {
    const { container } = render(
      <PipelineCard
        conversation={buildConversation()}
        onDragStart={jest.fn()}
        onDragEnd={jest.fn()}
        onMoveToColumn={jest.fn()}
        dragging
      />,
    );
    expect(container.firstChild).toHaveClass('opacity-40');
  });

  describe('card na coluna "Não cliente" (ADR #96)', () => {
    it('mostra "IA desligada" no lugar do tempo no estágio, mas mantém o ícone classificador normal (Design System, reskin 2026-08-07 — mockup nunca troca esse ícone)', () => {
      render(
        <PipelineCard
          conversation={buildConversation({ excludedFromPipeline: true, stageSetBy: 'ai' })}
          onDragStart={jest.fn()}
          onDragEnd={jest.fn()}
          onMoveToColumn={jest.fn()}
        />,
      );
      expect(screen.getByText('IA desligada')).toBeInTheDocument();
      expect(screen.getByTitle('Classificado pela IA')).toBeInTheDocument();
    });

    it('não exibe "tempo neste estágio" (a métrica só faz sentido dentro do funil)', () => {
      render(
        <PipelineCard
          conversation={buildConversation({ excludedFromPipeline: true })}
          onDragStart={jest.fn()}
          onDragEnd={jest.fn()}
          onMoveToColumn={jest.fn()}
        />,
      );
      expect(screen.queryByText(/neste estágio/)).not.toBeInTheDocument();
    });

    it('continua arrastável e com link para a conversa (o histórico segue acessível)', () => {
      render(
        <PipelineCard
          conversation={buildConversation({ excludedFromPipeline: true })}
          onDragStart={jest.fn()}
          onDragEnd={jest.fn()}
          onMoveToColumn={jest.fn()}
        />,
      );
      expect(screen.getByRole('link', { name: 'Ver conversa' })).toBeInTheDocument();
    });
  });

  it('Fase 1, Bloco F1.7: mostra "há N dias neste estágio" com base em stageUpdatedAt', () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    fiveDaysAgo.setHours(9, 0, 0, 0);
    render(
      <PipelineCard
        conversation={buildConversation({ stageUpdatedAt: fiveDaysAgo.toISOString() })}
        onDragStart={jest.fn()}
        onDragEnd={jest.fn()}
        onMoveToColumn={jest.fn()}
      />,
    );
    expect(screen.getByText('há 5 dias neste estágio')).toBeInTheDocument();
  });

  describe('tags (reskin 2026-08-07, Design System — chip de tag no card, ausente antes)', () => {
    it('mostra os chips das tags da conversa', () => {
      render(
        <PipelineCard
          conversation={buildConversation({
            tags: [{ id: 'tag-1', name: 'Enterprise', color: 'purple' }],
          })}
          onDragStart={jest.fn()}
          onDragEnd={jest.fn()}
          onMoveToColumn={jest.fn()}
        />,
      );
      expect(screen.getByText('Enterprise')).toBeInTheDocument();
    });

    it('não renderiza a linha de tags quando a conversa não tem nenhuma', () => {
      const { container } = render(
        <PipelineCard
          conversation={buildConversation({ tags: [] })}
          onDragStart={jest.fn()}
          onDragEnd={jest.fn()}
          onMoveToColumn={jest.fn()}
        />,
      );
      // Só o `title` do ícone classificador deve sobrar — nenhum chip de tag.
      expect(container.querySelectorAll('span[title]')).toHaveLength(1);
    });
  });

  describe('alternativa por teclado ao arrastar-e-soltar (achado de auditoria de acessibilidade, 2026-08-22)', () => {
    it('lista as outras colunas do Pipeline, excluindo a coluna atual', () => {
      render(
        <PipelineCard
          conversation={buildConversation({ stage: 'negotiating' })}
          onDragStart={jest.fn()}
          onDragEnd={jest.fn()}
          onMoveToColumn={jest.fn()}
        />,
      );
      const select = screen.getByRole('combobox', {
        name: 'Mover conversa para outro estágio do Pipeline',
      });
      const optionLabels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
      expect(optionLabels).toEqual([
        'Mover…',
        'Não cliente',
        'Novo',
        'Contatado',
        'Fechado',
        'Perdido',
      ]);
    });

    it('chamar onMoveToColumn com o estágio escolhido ao mudar o select', () => {
      const onMoveToColumn = jest.fn();
      render(
        <PipelineCard
          conversation={buildConversation({ stage: 'new' })}
          onDragStart={jest.fn()}
          onDragEnd={jest.fn()}
          onMoveToColumn={onMoveToColumn}
        />,
      );
      const select = screen.getByRole('combobox', {
        name: 'Mover conversa para outro estágio do Pipeline',
      });
      fireEvent.change(select, { target: { value: 'contacted' } });
      expect(onMoveToColumn).toHaveBeenCalledWith('contacted');
    });

    it('exclui a coluna atual das opções também para um card em "Não cliente"', () => {
      render(
        <PipelineCard
          conversation={buildConversation({ excludedFromPipeline: true, stage: 'negotiating' })}
          onDragStart={jest.fn()}
          onDragEnd={jest.fn()}
          onMoveToColumn={jest.fn()}
        />,
      );
      const select = screen.getByRole('combobox', {
        name: 'Mover conversa para outro estágio do Pipeline',
      });
      const optionValues = Array.from(select.querySelectorAll('option')).map(
        (o) => (o as HTMLOptionElement).value,
      );
      expect(optionValues).not.toContain('not_client');
      expect(optionValues).toContain('negotiating');
    });
  });
});
