/**
 * Milestone 6, Bloco M6C-5 — testes do primitivo `Input`.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { fireEvent } from '@testing-library/react';
import { Input } from '../../../components/ui/input';

describe('Input (Milestone 6, Bloco M6C-1)', () => {
  it('renderiza um <input> e aceita digitação', () => {
    render(<Input placeholder="voce@empresa.com" />);
    const input = screen.getByPlaceholderText('voce@empresa.com') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wesley@francis.app' } });
    expect(input.value).toBe('wesley@francis.app');
  });

  it('respeita disabled', () => {
    render(<Input disabled placeholder="desabilitado" />);
    expect(screen.getByPlaceholderText('desabilitado')).toBeDisabled();
  });

  it('propaga o type (ex.: password)', () => {
    render(<Input type="password" placeholder="senha" />);
    expect(screen.getByPlaceholderText('senha')).toHaveAttribute('type', 'password');
  });

  it('mescla className externo sem perder as classes internas', () => {
    render(<Input className="w-64" placeholder="com classe" />);
    const input = screen.getByPlaceholderText('com classe');
    expect(input).toHaveClass('w-64');
    expect(input).toHaveClass('rounded-md');
  });
});
