/**
 * Milestone 6, Bloco M6E-3 — teste do `MessageTimeline` (retrofit M6E-2):
 * `Skeleton` no carregamento, `ErrorState` com retry no erro.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageTimeline from '../../components/MessageTimeline';
import type { ConversationMessage } from '../../lib/clientApi';

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
