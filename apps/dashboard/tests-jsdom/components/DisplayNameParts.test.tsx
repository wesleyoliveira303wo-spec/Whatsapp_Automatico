/**
 * Padronização de exibição de contato — estilo visual do apelido do WhatsApp
 * (pedido do fundador, 2026-08-21): quando não há nome salvo, o telefone
 * (`primary`) some do apelido (`secondary`) em fonte menor e mais clara.
 *
 * ONDA 1 DO REDESIGN (2026-08-22): a distincao continua, o GRAU mudou.
 * `0.7em` + `text-muted-foreground/60` rendia ~2,2:1 de contraste — abaixo
 * do minimo AA (4,5:1) exigido por `PRODUCT_PRINCIPLES.md` §7, e na tela
 * real o nome do contato ficava quase invisivel em toda lista do produto.
 * Agora `0.8em` + `text-muted-foreground` (sem opacidade extra), que rende
 * ~5,5:1 sobre `--panel`.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DisplayNameParts from '../../components/DisplayNameParts';

describe('DisplayNameParts', () => {
  it('renderiza só primary quando não há secondary', () => {
    render(<DisplayNameParts primary="+55 11 99999-9999" />);

    expect(screen.getByText('+55 11 99999-9999')).toBeInTheDocument();
  });

  it('renderiza secondary num <span> separado, menor (80%) e mais claro — sem opacidade extra (contraste AA)', () => {
    render(<DisplayNameParts primary="+55 11 99999-9999" secondary="Maria Silva" />);

    const secondary = screen.getByText('Maria Silva');
    expect(secondary.tagName).toBe('SPAN');
    expect(secondary).toHaveClass('text-[0.8em]');
    expect(secondary).toHaveClass('text-muted-foreground');
    // Trava de regressao: a opacidade extra reprovava em contraste AA.
    expect(secondary.className).not.toContain('text-muted-foreground/');
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
