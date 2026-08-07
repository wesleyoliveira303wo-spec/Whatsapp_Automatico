/**
 * Reskin 2026-08-07 (Design System, tela Cérebro da IA) — teste do
 * primitivo `Switch`, primeiro toggle nativo do projeto (substitui
 * `<input type="checkbox">` cru onde usado).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Switch } from '../../../components/ui/switch';

describe('Switch (reskin 2026-08-07)', () => {
  it('renderiza com role="switch" e aria-checked refletindo o estado', () => {
    render(<Switch checked={false} onCheckedChange={jest.fn()} aria-label="Ativar" />);
    expect(screen.getByRole('switch', { name: 'Ativar' })).toHaveAttribute('aria-checked', 'false');
  });

  it('chama onCheckedChange com o valor invertido ao clicar', () => {
    const onCheckedChange = jest.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} aria-label="Ativar" />);
    fireEvent.click(screen.getByRole('switch', { name: 'Ativar' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('não dispara onCheckedChange quando desabilitado', () => {
    const onCheckedChange = jest.fn();
    render(
      <Switch checked={false} onCheckedChange={onCheckedChange} disabled aria-label="Ativar" />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Ativar' }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
