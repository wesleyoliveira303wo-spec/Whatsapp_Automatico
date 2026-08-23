/**
 * PRIMEIRO teste de componente do projeto (Milestone 4, Bloco M4E — D49/
 * ADR #59): jsdom + Testing Library, no projeto Jest isolado
 * `dashboard-jsdom` (ver jest.config.js — as suites `node` existentes nao
 * foram tocadas). Cobre os estados condicionais (erro/loading/vazio/dados)
 * de `AiUsageChart` e `MetricCard` — a logica de transformacao ja e testada
 * em `tests/lib/analyticsView.test.ts` (node); aqui so a renderizacao.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AiUsageChart from '../../components/AiUsageChart';
import MetricCard from '../../components/MetricCard';
import type { AiUsagePoint } from '../../lib/clientApi';

function buildPoint(overrides: Partial<AiUsagePoint> = {}): AiUsagePoint {
  return {
    date: '2026-07-05',
    interactions: 3,
    successCount: 2,
    validationRejectedCount: 0,
    providerErrorCount: 1,
    tokensInput: 100,
    tokensOutput: 50,
    costUsd: '0.00123456',
    avgLatencyMs: 420,
    ...overrides,
  };
}

describe('AiUsageChart (Milestone 4, Bloco M4E - jsdom)', () => {
  it('estado de erro: mostra a mensagem', () => {
    render(<AiUsageChart points={null} errorMessage="Falha ao carregar os dados de analytics." />);
    expect(screen.getByText('Falha ao carregar os dados de analytics.')).toBeInTheDocument();
  });

  it('estado de loading: mostra um skeleton do tamanho do gráfico (sem CLS)', () => {
    const { container } = render(<AiUsageChart points={null} errorMessage={null} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('estado vazio: mostra o empty state', () => {
    render(<AiUsageChart points={[]} errorMessage={null} />);
    expect(screen.getByText('Nenhuma interação de IA no período.')).toBeInTheDocument();
  });

  it('com dados: renderiza o container do grafico', () => {
    render(<AiUsageChart points={[buildPoint()]} errorMessage={null} />);
    expect(screen.getByTestId('ai-usage-chart')).toBeInTheDocument();
  });
});

describe('MetricCard (Milestone 4, Bloco M4E - jsdom)', () => {
  it('exibe label e valor como string exata (D46: custo nunca convertido para number na exibicao)', () => {
    render(
      <MetricCard
        label="Custo de IA no periodo"
        value="US$ 0.00123456"
        hint="String decimal exata"
      />,
    );
    expect(screen.getByText('Custo de IA no periodo')).toBeInTheDocument();
    expect(screen.getByText('US$ 0.00123456')).toBeInTheDocument();
    expect(screen.getByText('String decimal exata')).toBeInTheDocument();
  });
});
