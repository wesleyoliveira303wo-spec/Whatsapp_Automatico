import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import LandingPage from '../../pages/index';

/**
 * Landing page (2026-08-29) — smoke: a página monta, tem UM `<h1>`, e todo
 * CTA aponta para o fluxo de auth REAL (`/register` e `/login`). A copy vem
 * de `lib/landingContent.ts`, testada lá de forma indireta (renderização).
 */
describe('LandingPage', () => {
  it('renderiza com um único h1', () => {
    render(<LandingPage currentYear={2026} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('CTA primário leva para /register', () => {
    render(<LandingPage currentYear={2026} />);
    const ctas = screen.getAllByRole('link', { name: /criar conta grátis/i });
    expect(ctas.length).toBeGreaterThan(0);
    ctas.forEach((cta) => expect(cta).toHaveAttribute('href', '/register'));
  });

  it('link "Entrar" leva para /login', () => {
    render(<LandingPage currentYear={2026} />);
    expect(screen.getAllByRole('link', { name: 'Entrar' })[0]).toHaveAttribute('href', '/login');
  });

  it('mostra o plano Pro a R$ 99 com selo "Em breve"', () => {
    render(<LandingPage currentYear={2026} />);
    expect(screen.getByText('R$ 99')).toBeInTheDocument();
    expect(screen.getByText('Em breve')).toBeInTheDocument();
  });

  it('renderiza a FAQ como <details> acessível', () => {
    render(<LandingPage currentYear={2026} />);
    expect(
      screen.getByText('Como o Francis funciona?').closest('details'),
    ).toBeInTheDocument();
  });

  it('rodapé mostra o ano recebido por prop', () => {
    render(<LandingPage currentYear={2026} />);
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText(/© 2026 Francis/)).toBeInTheDocument();
  });
});
