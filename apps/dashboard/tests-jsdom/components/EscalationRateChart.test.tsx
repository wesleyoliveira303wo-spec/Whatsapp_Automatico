/**
 * Fase 1, Bloco F1.6 (Analytics de negócio) — teste do `EscalationRateChart`.
 * Mesmo padrão de `AiUsageChart.test.tsx`.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EscalationRateChart from '../../components/EscalationRateChart';
import type { EscalationRatePoint } from '../../lib/clientApi';

function buildPoint(overrides: Partial<EscalationRatePoint> = {}): EscalationRatePoint {
  return { date: '2026-07-05', totalConversations: 10, escalatedConversations: 3, ...overrides };
}

describe('EscalationRateChart (Fase 1, Bloco F1.6 - jsdom)', () => {
  it('estado de erro: mostra a mensagem', () => {
    render(
      <EscalationRateChart
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
      <EscalationRateChart points={null} errorMessage={null} from="2026-07-01" to="2026-07-10" />,
    );
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('estado vazio: mostra o empty state', () => {
    render(
      <EscalationRateChart points={[]} errorMessage={null} from="2026-07-01" to="2026-07-10" />,
    );
    expect(screen.getByText('Nenhuma conversa nova no período.')).toBeInTheDocument();
  });

  it('com dados: renderiza o container do grafico', () => {
    render(
      <EscalationRateChart
        points={[buildPoint()]}
        errorMessage={null}
        from="2026-07-05"
        to="2026-07-05"
      />,
    );
    expect(screen.getByTestId('escalation-rate-chart')).toBeInTheDocument();
  });
});
