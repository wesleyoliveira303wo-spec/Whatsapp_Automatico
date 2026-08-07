/**
 * Milestone 6, Bloco M6B-4 — testes dos componentes de marca. Verificam o
 * essencial da fundação de marca v1: o SVG renderiza, o nome vem SEMPRE de
 * lib/brand.ts (nunca hardcoded no componente) e a tagline só aparece quando
 * pedida. Se alguém trocar BRAND.name, estes testes acompanham a mudança —
 * é exatamente o ponto de centralizar a marca.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import FrancisLogo from '../../../components/brand/FrancisLogo';
import FrancisWordmark from '../../../components/brand/FrancisWordmark';
import { BRAND, pageTitle } from '../../../lib/brand';

describe('pageTitle (M6B-1)', () => {
  it('sem argumento devolve só o nome da marca', () => {
    expect(pageTitle()).toBe(BRAND.name);
  });

  it('com argumento monta "Página · Marca"', () => {
    expect(pageTitle('Conversas')).toBe(`Conversas · ${BRAND.name}`);
  });

  it('trata string vazia/espaços como sem argumento', () => {
    expect(pageTitle('   ')).toBe(BRAND.name);
  });
});

describe('FrancisLogo (M6B-1)', () => {
  it('renderiza um SVG acessível com o nome da marca como rótulo', () => {
    render(<FrancisLogo />);
    expect(screen.getByRole('img', { name: BRAND.name })).toBeInTheDocument();
  });

  it('aceita um título customizado para o rótulo acessível', () => {
    render(<FrancisLogo title="Ir para o início" />);
    expect(screen.getByRole('img', { name: 'Ir para o início' })).toBeInTheDocument();
  });
});

describe('FrancisWordmark (M6B-1)', () => {
  it('mostra o nome da marca vindo de lib/brand.ts', () => {
    // { selector: 'span' } é necessário porque o FrancisLogo interno também
    // tem um <title> de acessibilidade com o mesmo texto (BRAND.name) — sem
    // o selector, getByText bate nos dois elementos e falha por ambiguidade.
    render(<FrancisWordmark />);
    expect(screen.getByText(BRAND.name, { selector: 'span' })).toBeInTheDocument();
  });

  it('não mostra a tagline por padrão', () => {
    render(<FrancisWordmark />);
    expect(screen.queryByText(BRAND.tagline)).not.toBeInTheDocument();
  });

  it('mostra a tagline quando showTagline é true', () => {
    render(<FrancisWordmark showTagline />);
    expect(screen.getByText(BRAND.tagline)).toBeInTheDocument();
  });
});
