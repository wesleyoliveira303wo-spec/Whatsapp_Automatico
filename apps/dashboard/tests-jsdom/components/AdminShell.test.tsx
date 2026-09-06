import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AdminShell from '@/components/admin/AdminShell';

const replace = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/admin', replace }),
}));

const platformLogout = jest.fn();
jest.mock('@/lib/platformClientApi', () => ({
  platformLogout: (...args: unknown[]) => platformLogout(...args),
}));

const ADMIN = { id: 'admin-1', email: 'dono@francis.app', name: 'Dono' };

describe('AdminShell', () => {
  beforeEach(() => {
    replace.mockReset().mockResolvedValue(true);
    platformLogout.mockReset().mockResolvedValue(undefined);
  });

  it('mostra quem está logado', () => {
    render(
      <AdminShell admin={ADMIN}>
        <p>conteúdo</p>
      </AdminShell>,
    );

    expect(screen.getByText('Dono')).toBeInTheDocument();
    expect(screen.getByText('dono@francis.app')).toBeInTheDocument();
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });

  it('Início é link de verdade; os destinos das próximas fases ficam visíveis e desabilitados', () => {
    render(
      <AdminShell admin={ADMIN}>
        <p>conteúdo</p>
      </AdminShell>,
    );

    expect(screen.getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/admin');
    // Tenants (Fase 2), Saúde (Fase 3) e Suporte (Fase 5) são links de verdade.
    expect(screen.getByRole('link', { name: 'Tenants' })).toHaveAttribute(
      'href',
      '/admin/tenants',
    );
    expect(screen.getByRole('link', { name: 'Saúde' })).toHaveAttribute('href', '/admin/health');
    expect(screen.getByRole('link', { name: 'Suporte' })).toHaveAttribute(
      'href',
      '/admin/support',
    );
    // Auditoria (Fase 6) ainda aparece, mas não é link quebrado.
    expect(screen.queryByRole('link', { name: 'Auditoria' })).toBeNull();
    expect(screen.getByText('Auditoria')).toHaveAttribute('aria-disabled', 'true');
  });

  it('marca a página atual para o leitor de tela', () => {
    render(
      <AdminShell admin={ADMIN}>
        <p>conteúdo</p>
      </AdminShell>,
    );

    expect(screen.getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page');
  });

  it('sair encerra a sessão e volta para o login do painel', async () => {
    render(
      <AdminShell admin={ADMIN}>
        <p>conteúdo</p>
      </AdminShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: /sair/i }));

    await waitFor(() => expect(platformLogout).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith('/admin/login');
  });

  it('sai mesmo se a chamada de logout falhar — nunca prende o fundador na tela', async () => {
    platformLogout.mockRejectedValue(new Error('sem rede'));
    render(
      <AdminShell admin={ADMIN}>
        <p>conteúdo</p>
      </AdminShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: /sair/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/login'));
  });
});
