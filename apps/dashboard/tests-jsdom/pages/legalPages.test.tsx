import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TermosPage from '../../pages/termos';
import PrivacidadePage from '../../pages/privacidade';

/**
 * T6 (Lançamento suave) — as páginas legais montam, têm UM `<h1>`, cobrem os
 * pontos exigidos pelo brief (o que é coletado, para quê, retenção,
 * exclusão a pedido, contato) e têm um caminho de volta para a landing.
 */
describe('Páginas legais', () => {
  it('/termos renderiza com um h1 e cobre planos, encerramento e contato', () => {
    render(<TermosPage currentYear={2026} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Termos de Uso' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voltar para francis/i })).toHaveAttribute('href', '/');
    expect(screen.getByText(/Planos e pagamento/i)).toBeInTheDocument();
    expect(screen.getByText(/Encerramento/i)).toBeInTheDocument();
    expect(screen.getAllByText(/98292-5941/).length).toBeGreaterThan(0);
  });

  it('/privacidade renderiza com um h1 e cobre coleta, uso, retenção e exclusão a pedido', () => {
    render(<PrivacidadePage currentYear={2026} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Política de Privacidade' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Dados que coletamos/i)).toBeInTheDocument();
    expect(screen.getByText(/Para que usamos/i)).toBeInTheDocument();
    expect(screen.getByText(/Retenção/i)).toBeInTheDocument();
    expect(screen.getByText(/exclusão de todos os dados da sua conta/i)).toBeInTheDocument();
    expect(screen.getByText(/opt-out/i)).toBeInTheDocument();
  });
});
