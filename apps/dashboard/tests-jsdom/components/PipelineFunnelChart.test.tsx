/**
 * Fase 1, Bloco F1.6 (Analytics de negócio) — teste do `PipelineFunnelChart`.
 * Mesmo padrão de `AiUsageChart.test.tsx`: estados condicionais (erro/
 * loading/vazio/dados), sem mockar recharts.
 *
 * Reskin 2026-08-07 (Design System, tela Analytics): as badges por estágio e
 * o texto de taxa de conversão SAÍRAM deste componente (o mockup mostra só
 * barras horizontais, sem badges ao lado) — a taxa de conversão continua
 * calculada, só migrou para o subtítulo do card em `analytics.tsx`, via a
 * função pura `pipelineConversionRate` (`lib/analyticsView.ts`, testada em
 * `tests/lib/analyticsView.test.ts`).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PipelineFunnelChart from '../../components/PipelineFunnelChart';
import type { PipelineFunnelCounts } from '../../lib/clientApi';

function buildFunnel(overrides: Partial<PipelineFunnelCounts> = {}): PipelineFunnelCounts {
  return { new: 10, contacted: 5, negotiating: 3, closed_won: 2, closed_lost: 1, ...overrides };
}

describe('PipelineFunnelChart (Fase 1, Bloco F1.6 - jsdom)', () => {
  it('estado de erro: mostra a mensagem', () => {
    render(
      <PipelineFunnelChart funnel={null} errorMessage="Falha ao carregar os dados de analytics." />,
    );
    expect(screen.getByText('Falha ao carregar os dados de analytics.')).toBeInTheDocument();
  });

  it('estado de loading: mostra o texto de carregamento', () => {
    render(<PipelineFunnelChart funnel={null} errorMessage={null} />);
    expect(screen.getByText(/Carregando funil do Pipeline/)).toBeInTheDocument();
  });

  it('estado vazio: mostra o empty state quando todos os estagios sao zero', () => {
    render(
      <PipelineFunnelChart
        funnel={buildFunnel({
          new: 0,
          contacted: 0,
          negotiating: 0,
          closed_won: 0,
          closed_lost: 0,
        })}
        errorMessage={null}
      />,
    );
    expect(screen.getByText('Nenhuma conversa no Pipeline ainda.')).toBeInTheDocument();
  });

  it('com dados: renderiza o container do grafico', () => {
    // jsdom não faz layout de verdade — `ResponsiveContainer` do recharts
    // relata largura/altura 0 e não chega a renderizar o SVG interno (mesma
    // limitação já documentada nos outros testes de gráfico deste projeto,
    // ex. `AiUsageChart.test.tsx`); por isso só o container é verificado
    // aqui, não o texto dos rótulos (que vive dentro do SVG).
    render(<PipelineFunnelChart funnel={buildFunnel()} errorMessage={null} />);
    expect(screen.getByTestId('pipeline-funnel-chart')).toBeInTheDocument();
  });
});
