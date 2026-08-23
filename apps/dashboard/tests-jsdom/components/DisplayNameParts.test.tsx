/**
 * Padronização de exibição de contato — estilo visual do apelido do WhatsApp
 * (pedido do fundador, 2026-08-21): quando não há nome salvo, o telefone
 * (`primary`) some do apelido (`secondary`) em fonte 70% menor e mais
 * clara/transparente.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DisplayNameParts from '../../components/DisplayNameParts';

describe('DisplayNameParts', () => {
  it('renderiza só primary quando não há secondary', () => {
    render(<DisplayNameParts primary="+55 11 99999-9999" />);

    expect(screen.getByText('+55 11 99999-9999')).toBeInTheDocument();
  });

  it('renderiza secondary num <span> separado, menor (70%) e mais claro/transparente', () => {
    render(<DisplayNameParts primary="+55 11 99999-9999" secondary="Maria Silva" />);

    const secondary = screen.getByText('Maria Silva');
    expect(secondary.tagName).toBe('SPAN');
    expect(secondary).toHaveClass('text-[0.7em]');
    expect(secondary).toHaveClass('text-muted-foreground/60');
  });

  it('primary e secondary saem em elementos separados, cada um com seu próprio texto', () => {
    render(<DisplayNameParts primary="+55 11 99999-9999" secondary="Maria Silva" />);

    const primary = screen.getByText('+55 11 99999-9999');
    const secondary = screen.getByText('Maria Silva');
    expect(primary).not.toBe(secondary);
    expect(primary.tagName).toBe('SPAN');
    expect(secondary.tagName).toBe('SPAN');
  });
});
