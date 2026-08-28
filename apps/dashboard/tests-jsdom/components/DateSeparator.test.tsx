/**
 * Reskin 2026-08-27 — pill central de data ("Hoje"/"Ontem"/data curta),
 * extraída do markup inline de `MessageTimeline` para virar componente
 * próprio, com a aparência da referência (cápsula clara e centralizada).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DateSeparator from '../../components/DateSeparator';

describe('DateSeparator', () => {
  it('mostra "Hoje" para a data de hoje', () => {
    render(<DateSeparator occurredAt={new Date().toISOString()} />);
    expect(screen.getByText('Hoje')).toBeInTheDocument();
  });

  it('mostra a data curta para uma data antiga', () => {
    render(<DateSeparator occurredAt="2020-03-15T10:00:00.000Z" />);
    expect(screen.getByText(/15\/03\/2020/)).toBeInTheDocument();
  });

  it('é centralizado horizontalmente e tem formato de cápsula', () => {
    const { container } = render(<DateSeparator occurredAt={new Date().toISOString()} />);
    const item = container.querySelector('li');
    expect(item).toHaveClass('justify-center');
    expect(container.querySelector('.rounded-lg')).toBeInTheDocument();
  });

  it('data inválida: não renderiza pill vazia', () => {
    const { container } = render(<DateSeparator occurredAt="não é data" />);
    expect(container.querySelector('li')).not.toBeInTheDocument();
  });
});
