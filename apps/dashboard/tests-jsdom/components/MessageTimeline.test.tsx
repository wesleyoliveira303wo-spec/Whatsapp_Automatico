/**
 * Milestone 6, Bloco M6E-3 — teste do `MessageTimeline` (retrofit M6E-2):
 * `Skeleton` no carregamento, `ErrorState` com retry no erro.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageTimeline from '../../components/MessageTimeline';
import type { ConversationMessage, AiInteractionSummary } from '../../lib/clientApi';

function buildInteraction(overrides: Partial<AiInteractionSummary> = {}): AiInteractionSummary {
  return {
    id: 'i1',
    tenantId: 't1',
    conversationId: 'c1',
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    promptVersion: 'v1',
    tokensInput: 10,
    tokensOutput: 20,
    costUsd: '0.0001',
    latencyMs: 500,
    status: 'success',
    ...overrides,
  };
}

function buildMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: 'm1',
    tenantId: 't1',
    conversationId: 'c1',
    direction: 'inbound',
    content: 'Olá, tudo bem?',
    occurredAt: '2026-07-24T09:00:00.000Z',
    ...overrides,
  };
}

describe('MessageTimeline (Milestone 6, Bloco M6E-2)', () => {
  it('estado de erro: mostra o ErrorState e aciona onRetry', () => {
    const onRetry = jest.fn();
    render(
      <MessageTimeline
        messages={null}
        interactions={null}
        errorMessage="Falha ao carregar."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Falha ao carregar.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('estado de carregamento: mostra os skeletons de bolha', () => {
    const { container } = render(
      <MessageTimeline
        messages={null}
        interactions={null}
        errorMessage={null}
        onRetry={jest.fn()}
      />,
    );
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('estado vazio: mostra a mensagem de nenhuma mensagem', () => {
    render(
      <MessageTimeline messages={[]} interactions={[]} errorMessage={null} onRetry={jest.fn()} />,
    );
    expect(screen.getByText('Nenhuma mensagem nesta conversa ainda.')).toBeInTheDocument();
  });

  it('com dados: renderiza as mensagens', () => {
    render(
      <MessageTimeline
        messages={[buildMessage()]}
        interactions={[]}
        errorMessage={null}
        onRetry={jest.fn()}
      />,
    );
    expect(screen.getByText('Olá, tudo bem?')).toBeInTheDocument();
  });

  describe('correlação Message <-> AiInteraction (D27) — correção 2026-08-18', () => {
    it('mostra "Gerada por IA" numa mensagem OUTBOUND cujo id bate com AiInteraction.messageId', () => {
      render(
        <MessageTimeline
          messages={[buildMessage({ id: 'm1', direction: 'outbound', content: 'Resposta da IA' })]}
          interactions={[buildInteraction({ messageId: 'm1' })]}
          errorMessage={null}
          onRetry={jest.fn()}
        />,
      );
      expect(screen.getByText(/Gerada por IA/)).toBeInTheDocument();
    });

    it('NUNCA mostra "Gerada por IA" numa mensagem INBOUND, mesmo que o id bata (campo de duplo propósito no backend)', () => {
      // Cenário real: `AiInteraction.messageId` ainda aponta para a mensagem
      // INBOUND que originou a geração (F1.4) porque o envio outbound ainda
      // não foi confirmado (`linkMessage()` não rodou) — sem o guard em
      // `MessageTimeline`, o selo apareceria por engano na própria mensagem
      // do cliente (achado real: um áudio recebido marcado como "gerado pela IA").
      render(
        <MessageTimeline
          messages={[buildMessage({ id: 'm1', direction: 'inbound', content: 'Pergunta do cliente' })]}
          interactions={[buildInteraction({ messageId: 'm1' })]}
          errorMessage={null}
          onRetry={jest.fn()}
        />,
      );
      expect(screen.queryByText(/Gerada por IA/)).not.toBeInTheDocument();
    });
  });

  describe('divisor de data (Redesign 2026-08-05, R3)', () => {
    it('mostra um único divisor quando todas as mensagens são do mesmo dia', () => {
      const messages = [
        buildMessage({ id: 'm1', content: 'primeira', occurredAt: '2026-07-24T09:00:00.000Z' }),
        buildMessage({ id: 'm2', content: 'segunda', occurredAt: '2026-07-24T14:00:00.000Z' }),
      ];
      render(
        <MessageTimeline
          messages={messages}
          interactions={[]}
          errorMessage={null}
          onRetry={jest.fn()}
        />,
      );
      expect(screen.getAllByText('24/07/2026')).toHaveLength(1);
    });

    it('mostra um divisor por dia quando as mensagens cruzam a virada do dia', () => {
      const messages = [
        buildMessage({ id: 'm1', content: 'dia 1', occurredAt: '2026-07-24T09:00:00.000Z' }),
        buildMessage({ id: 'm2', content: 'dia 2', occurredAt: '2026-07-25T09:00:00.000Z' }),
      ];
      render(
        <MessageTimeline
          messages={messages}
          interactions={[]}
          errorMessage={null}
          onRetry={jest.fn()}
        />,
      );
      expect(screen.getByText('24/07/2026')).toBeInTheDocument();
      expect(screen.getByText('25/07/2026')).toBeInTheDocument();
    });
  });
});
