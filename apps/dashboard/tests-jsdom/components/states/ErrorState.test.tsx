/**
 * Milestone 6, Bloco M6D-3 — teste do `ErrorState`.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ErrorState from '../../../components/states/ErrorState';

describe('ErrorState (Milestone 6, Bloco M6D-2)', () => {
  it('usa o título padrão quando nenhum é passado', () => {
    render(<ErrorState />);
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();
  });

  it('renderiza título e descrição customizados', () => {
    render(<ErrorState title="Não foi possível carregar" description="Verifique sua conexão." />);
    expect(screen.getByText('Não foi possível carregar')).toBeInTheDocument();
    expect(screen.getByText('Verifique sua conexão.')).toBeInTheDocument();
  });

  it('não renderiza botão de retry quando onRetry não é passado', () => {
    render(<ErrorState />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('chama onRetry ao clicar no botão', () => {
    const onRetry = jest.fn();
    render(<ErrorState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('aceita um retryLabel customizado', () => {
    const onRetry = jest.fn();
    render(<ErrorState onRetry={onRetry} retryLabel="Recarregar" />);
    expect(screen.getByRole('button', { name: /Recarregar/ })).toBeInTheDocument();
  });
});
