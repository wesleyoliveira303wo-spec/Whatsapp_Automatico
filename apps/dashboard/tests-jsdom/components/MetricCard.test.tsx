/** Teste minimo da infra jsdom (Milestone 4, Bloco M4E — D49): MetricCard nao importa recharts, entao valida o ambiente jsdom/Testing Library isoladamente do peso do bundle de graficos. */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MetricCard from '../../components/MetricCard';

describe('MetricCard (Milestone 4, Bloco M4E - jsdom, infra)', () => {
  it('exibe label e valor como string exata (D46)', () => {
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

  it('omite o hint quando ausente', () => {
    render(<MetricCard label="Interacoes" value="42" />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.queryByText('String decimal exata')).not.toBeInTheDocument();
  });
});
