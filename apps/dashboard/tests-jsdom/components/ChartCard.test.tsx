/**
 * Reskin 2026-08-07 (Design System, tela Analytics) — teste do `ChartCard`,
 * moldura compartilhada dos 6 gráficos.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChartCard from '../../components/ChartCard';

describe('ChartCard (reskin 2026-08-07)', () => {
  it('mostra título, subtítulo e o conteúdo', () => {
    render(
      <ChartCard
        title="Uso de IA por dia"
        subtitle="Custo estimado em dólares, por dia do período."
      >
        <p>conteúdo do gráfico</p>
      </ChartCard>,
    );
    expect(screen.getByText('Uso de IA por dia')).toBeInTheDocument();
    expect(screen.getByText('Custo estimado em dólares, por dia do período.')).toBeInTheDocument();
    expect(screen.getByText('conteúdo do gráfico')).toBeInTheDocument();
  });
});
