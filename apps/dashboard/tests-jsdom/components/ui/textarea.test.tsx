/**
 * Milestone 6, Bloco M6H-1b — testes do primitivo `Textarea` (criado para o
 * retrofit do `AiProfilePanel`, mesmo padrão do `Input`, M6C-1).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Textarea } from '../../../components/ui/textarea';

describe('Textarea (Milestone 6, Bloco M6H-1b)', () => {
  it('renderiza um <textarea> e aceita digitação', () => {
    render(<Textarea placeholder="Descreva sua empresa" />);
    const textarea = screen.getByPlaceholderText('Descreva sua empresa') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Salão da Maria' } });
    expect(textarea.value).toBe('Salão da Maria');
  });

  it('respeita disabled', () => {
    render(<Textarea disabled placeholder="desabilitado" />);
    expect(screen.getByPlaceholderText('desabilitado')).toBeDisabled();
  });

  it('mescla className externo sem perder as classes internas', () => {
    render(<Textarea className="font-mono" placeholder="com classe" />);
    const textarea = screen.getByPlaceholderText('com classe');
    expect(textarea).toHaveClass('font-mono');
    expect(textarea).toHaveClass('rounded-md');
  });
});
