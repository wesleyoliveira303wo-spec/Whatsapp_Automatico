/**
 * Fase 1 (2026-08-07) — Botão POWER: liga/desliga a resposta automática da
 * IA de uma sessão, sem afetar a conexão do WhatsApp. `useAiToggleContext`
 * é mockado (mesmo padrão de `SessionSidebar.test.tsx`/`useSessionDetail`) —
 * a busca/persistência real fica coberta pelos testes de `clientApi`/BFF;
 * o compartilhamento de estado com `ConversationInbox` fica coberto por
 * `AiToggleContext.test.tsx`.
 *
 * Correção 2026-08-07 (2ª rodada) — migrado de `useAiToggle` direto para
 * `useAiToggleContext` (o componente não recebe mais `sessionName` como
 * prop, lê do Context montado por `SessionLayout`).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AiPowerToggle from '../../components/AiPowerToggle';
import * as aiToggleContextModule from '../../contexts/AiToggleContext';

jest.mock('../../contexts/AiToggleContext');

const mockUseAiToggleContext = aiToggleContextModule.useAiToggleContext as jest.Mock;

describe('AiPowerToggle (Fase 1, Botão POWER, 2026-08-07)', () => {
  it('mostra um Skeleton enquanto o estado inicial ainda não chegou', () => {
    mockUseAiToggleContext.mockReturnValue({ aiEnabled: null, loading: true, errorMessage: null, toggle: jest.fn() });
    const { container } = render(<AiPowerToggle />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('POWER ligado: mostra o texto exato "IA aguardando novas mensagens"', () => {
    mockUseAiToggleContext.mockReturnValue({ aiEnabled: true, loading: false, errorMessage: null, toggle: jest.fn() });
    render(<AiPowerToggle />);
    expect(screen.getByRole('button')).toHaveTextContent('IA aguardando novas mensagens');
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('POWER desligado: mostra o texto exato "IA desativada"', () => {
    mockUseAiToggleContext.mockReturnValue({ aiEnabled: false, loading: false, errorMessage: null, toggle: jest.fn() });
    render(<AiPowerToggle />);
    expect(screen.getByRole('button')).toHaveTextContent('IA desativada');
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('chama toggle() ao clicar', () => {
    const toggle = jest.fn();
    mockUseAiToggleContext.mockReturnValue({ aiEnabled: true, loading: false, errorMessage: null, toggle });
    render(<AiPowerToggle />);
    fireEvent.click(screen.getByRole('button'));
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});
