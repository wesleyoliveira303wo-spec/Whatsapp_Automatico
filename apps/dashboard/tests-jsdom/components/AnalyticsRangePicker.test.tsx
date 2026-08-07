/**
 * Reskin 2026-08-07 (Design System, tela Analytics) — teste do
 * `AnalyticsRangePicker`: ganhou o preset "14 dias" (o mockup tem 4 opções,
 * não mais 3) e migrou de cinza/branco cru para tokens.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AnalyticsRangePicker from '../../components/AnalyticsRangePicker';
import { presetRange } from '../../lib/analyticsView';

describe('AnalyticsRangePicker (reskin 2026-08-07)', () => {
  it('mostra as 4 opções de período', () => {
    render(<AnalyticsRangePicker value={presetRange(7)} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: '7 dias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '14 dias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 dias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '90 dias' })).toBeInTheDocument();
  });

  it('marca a opção ativa via aria-pressed', () => {
    render(<AnalyticsRangePicker value={presetRange(14)} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: '14 dias' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '7 dias' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('chama onChange com o novo range ao clicar', () => {
    const onChange = jest.fn();
    render(<AnalyticsRangePicker value={presetRange(7)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '14 dias' }));
    expect(onChange).toHaveBeenCalledWith(presetRange(14));
  });
});
