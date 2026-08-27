/**
 * Reorganização Perfil/Configurações (2026-08-27) — identidade/logout/trocar
 * senha saíram daqui (migraram para `/settings` → Perfil); a engrenagem
 * passou a existir aqui também (o Workspace é alcançável sem sessão
 * conectada, então Configurações precisa ser alcançável daqui também).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Header from '../../components/Header';

describe('Header (Reorganização Perfil/Configurações)', () => {
  it('sem tenantId (tela de login): não mostra a engrenagem', () => {
    render(<Header />);
    expect(screen.queryByLabelText('Configurações')).not.toBeInTheDocument();
  });

  it('com tenantId: mostra a engrenagem, link para /settings', () => {
    render(<Header tenantId="tenant-1" />);
    const link = screen.getByLabelText('Configurações');
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('não mostra mais e-mail/cargo/trocar senha/sair (migraram para o Perfil)', () => {
    render(<Header tenantId="tenant-1" />);
    expect(screen.queryByText(/trocar senha/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sair/i })).not.toBeInTheDocument();
  });
});
