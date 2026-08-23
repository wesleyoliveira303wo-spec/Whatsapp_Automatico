/**
 * Milestone 3, Bloco 6 (D28) — teste do `AiInteractionPanel`: lista de
 * interações de IA embutida no detalhe da conversa. Gap pré-existente
 * fechado nesta rodada (Onda 1 do redesign, 2026-08-22) — o botão "Tentar
 * novamente" era reimplementado à mão em vez de usar `ErrorState`.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AiInteractionPanel from '../../components/AiInteractionPanel';
import type { AiInteractionSummary } from '../../lib/clientApi';

function interaction(over: Partial<AiInteractionSummary> = {}): AiInteractionSummary {
  return {
    id: 'ai-1',
    tenantId: 'tenant-1',
    conversationId: 'conv-1',
    provider: 'gemini',
    promptVersion: 'v4',
    tokensInput: 100,
    tokensOutput: 50,
    costUsd: '0.001',
    latencyMs: 800,
    status: 'success',
    createdAt: '2026-08-05T12:00:00.000Z',
    ...over,
  };
}

describe('AiInteractionPanel', () => {
  it('mostra um skeleton enquanto carrega (sem CLS)', () => {
    const { container } = render(
      <AiInteractionPanel interactions={null} errorMessage={null} onRetry={jest.fn()} />,
    );
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('mostra mensagem de lista vazia quando não há interações', () => {
    render(<AiInteractionPanel interactions={[]} errorMessage={null} onRetry={jest.fn()} />);
    expect(
      screen.getByText('Nenhuma interacao de IA nesta conversa ainda.'),
    ).toBeInTheDocument();
  });

  it('lista as interações quando há dados', () => {
    render(
      <AiInteractionPanel
        interactions={[interaction()]}
        errorMessage={null}
        onRetry={jest.fn()}
      />,
    );
    expect(screen.getByText(/gemini/i)).toBeInTheDocument();
  });

  it('erro vira ErrorState com retry conectado ao onRetry recebido', () => {
    const onRetry = jest.fn();
    render(
      <AiInteractionPanel
        interactions={null}
        errorMessage="Falha ao carregar interações."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Falha ao carregar interações.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
