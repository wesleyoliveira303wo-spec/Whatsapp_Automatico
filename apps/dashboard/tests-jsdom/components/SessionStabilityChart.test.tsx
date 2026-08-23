/**
 * Fase 1, Bloco F1.6 — teste do `SessionStabilityChart`. Métrica implementada
 * ponta a ponta desde a M4D mas nunca antes renderizada; primeiro teste de
 * componente dela. Mesmo padrão de `AiUsageChart.test.tsx`.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionStabilityChart from '../../components/SessionStabilityChart';
import type { SessionStabilityPoint } from '../../lib/clientApi';

function buildPoint(overrides: Partial<SessionStabilityPoint> = {}): SessionStabilityPoint {
  return { date: '2026-07-05', connected: 2, disconnected: 1, connecting: 0, ...overrides };
}

describe('SessionStabilityChart (Fase 1, Bloco F1.6 - jsdom)', () => {
  it('estado de erro: mostra a mensagem', () => {
    render(
      <SessionStabilityChart
        points={null}
        errorMessage="Falha ao carregar os dados de analytics."
        from="2026-07-01"
        to="2026-07-10"
      />,
    );
    expect(screen.getByText('Falha ao carregar os dados de analytics.')).toBeInTheDocument();
  });

  it('estado de loading: mostra um skeleton do tamanho do gráfico (sem CLS)', () => {
    const { container } = render(
      <SessionStabilityChart points={null} errorMessage={null} from="2026-07-01" to="2026-07-10" />,
    );
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('estado vazio: mostra o empty state', () => {
    render(
      <SessionStabilityChart points={[]} errorMessage={null} from="2026-07-01" to="2026-07-10" />,
    );
    expect(screen.getByText('Nenhuma transição de status no período.')).toBeInTheDocument();
  });

  it('com dados: renderiza o container do grafico', () => {
    render(
      <SessionStabilityChart
        points={[buildPoint()]}
        errorMessage={null}
        from="2026-07-05"
        to="2026-07-05"
      />,
    );
    expect(screen.getByTestId('session-stability-chart')).toBeInTheDocument();
  });
});
