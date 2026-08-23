/**
 * Milestone 6, Bloco M6C-5 — testes do primitivo `Badge`. Variantes
 * `success`/`warning` mapeiam o contrato de cor de `PRODUCT_PRINCIPLES.md`
 * §2.3 (ver DESIGN_SYSTEM.md §2) — testadas explicitamente para travar o
 * significado (não é só estética).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Badge } from '../../../components/ui/badge';

describe('Badge (Milestone 6, Bloco M6C-1)', () => {
  it('variante default aplica a cor de marca (bg-primary)', () => {
    render(<Badge>Padrão</Badge>);
    expect(screen.getByText('Padrão')).toHaveClass('bg-primary');
  });

  /**
   * Onda 2 do redesign (2026-08-23) — `bg-success`/`bg-warning` SÓLIDOS
   * reprovavam contraste AA (3.20:1/3.24:1, medido) para o texto branco de
   * `text-xs` semibold. Trocado para o padrão translúcido (`bg-success/[.12]`
   * + `text-success-emphasis`) já usado em todo o resto do produto —
   * `text-*-emphasis` é o que a trava de significado abaixo precisa checar
   * agora, não mais `bg-*` sólido.
   */
  it('variante success (saudável/conectado)', () => {
    render(<Badge variant="success">Conectado</Badge>);
    expect(screen.getByText('Conectado')).toHaveClass('text-success-emphasis');
  });

  it('variante warning (aguardando humano)', () => {
    render(<Badge variant="warning">Aguardando</Badge>);
    expect(screen.getByText('Aguardando')).toHaveClass('text-warning-emphasis');
  });

  it('success/warning nunca voltam a ser fundo sólido (trava de regressão do bug de contraste)', () => {
    render(
      <>
        <Badge variant="success">Conectado</Badge>
        <Badge variant="warning">Aguardando</Badge>
      </>,
    );
    expect(screen.getByText('Conectado')).not.toHaveClass('bg-success');
    expect(screen.getByText('Aguardando')).not.toHaveClass('bg-warning');
  });

  it('variante destructive (erro/desconectado)', () => {
    render(<Badge variant="destructive">Erro</Badge>);
    expect(screen.getByText('Erro')).toHaveClass('bg-destructive');
  });

  it('mescla className externo sem perder a variante', () => {
    render(
      <Badge variant="success" className="ml-2">
        Com classe
      </Badge>,
    );
    const badge = screen.getByText('Com classe');
    expect(badge).toHaveClass('ml-2');
    expect(badge).toHaveClass('text-success-emphasis');
  });
});
