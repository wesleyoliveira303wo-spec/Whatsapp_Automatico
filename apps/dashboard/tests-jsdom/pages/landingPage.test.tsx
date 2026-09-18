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

  it('mostra os quatro planos do B5 (Grátis R$ 0 / Disparos R$ 69 / Pro R$ 119 / Enterprise R$ 249)', () => {
    render(<LandingPage currentYear={2026} />);
    const planos = document.getElementById('planos') as HTMLElement;
    expect(within(planos).getByText('Grátis')).toBeInTheDocument();
    expect(within(planos).getByText('Disparos')).toBeInTheDocument();
    expect(within(planos).getByText('Pro')).toBeInTheDocument();
    expect(within(planos).getByText('Enterprise')).toBeInTheDocument();
    expect(within(planos).getByText('R$ 0')).toBeInTheDocument();
    expect(within(planos).getByText('R$ 69')).toBeInTheDocument();
    expect(within(planos).getByText('R$ 119')).toBeInTheDocument();
    expect(within(planos).getByText('R$ 249')).toBeInTheDocument();
    // Nenhuma copy dizendo que o Grátis inclui IA/pipeline/analytics como recurso ativo.
    expect(within(planos).queryByText('Em breve')).not.toBeInTheDocument();
    expect(within(planos).getAllByText(/A IA não responde/i).length).toBeGreaterThan(0);
  });

  it('CTAs dos três planos pagos instruem chamar o WhatsApp comercial para ativar', () => {
    render(<LandingPage currentYear={2026} />);
    const planos = document.getElementById('planos') as HTMLElement;
    const notes = within(planos).getAllByText(/chame o comercial no WhatsApp \(21\) 98292-5941/i);
    expect(notes.length).toBe(3);
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

  it('rodapé linka /termos e /privacidade (T6 — não mais "em breve")', () => {
    render(<LandingPage currentYear={2026} />);
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Termos de uso' })).toHaveAttribute(
      'href',
      '/termos',
    );
    expect(within(footer).getByRole('link', { name: 'Privacidade' })).toHaveAttribute(
      'href',
      '/privacidade',
    );
    expect(within(footer).queryByText(/\(em breve\)/i)).not.toBeInTheDocument();
  });
});
