/**
 * Milestone 6, Bloco M6A-5 — prova de pipeline: shadcn/ui + Radix Slot +
 * cva + `cn()` + tokens do tema (`bg-primary` etc.) compilando e renderizando
 * juntos. Não é (ainda) um teste de uso real do produto — nenhuma tela
 * consome este componente neste bloco.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Button } from '../../../components/ui/button';

describe('Button (Milestone 6, Bloco M6A-5 - shadcn/ui, prova de pipeline)', () => {
  it('renderiza como <button> com o texto e a variante default', () => {
    render(<Button>Salvar</Button>);
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-primary');
  });

  it('aplica a classe da variante solicitada (destructive)', () => {
    render(<Button variant="destructive">Remover</Button>);
    expect(screen.getByRole('button', { name: 'Remover' })).toHaveClass('bg-destructive');
  });

  it('respeita disabled', () => {
    render(<Button disabled>Enviando...</Button>);
    expect(screen.getByRole('button', { name: 'Enviando...' })).toBeDisabled();
  });

  it('asChild renderiza no elemento filho (Radix Slot), sem envolver em <button>', () => {
    render(
      <Button asChild>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- prova de composição do Radix Slot, não navegação real de página */}
        <a href="/conversations">Ver conversas</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Ver conversas' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveClass('bg-primary');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('mescla className externo sem perder as classes internas (cn/tailwind-merge)', () => {
    render(<Button className="w-full">Continuar</Button>);
    const button = screen.getByRole('button', { name: 'Continuar' });
    expect(button).toHaveClass('w-full');
    expect(button).toHaveClass('bg-primary');
  });
});
