/**
 * Reorganização Perfil/Configurações (2026-08-27) — identidade/trocar senha
 * saíram daqui (migraram para `/settings` → Perfil); a engrenagem passou a
 * existir aqui também (o Workspace é alcançável sem sessão conectada, então
 * Configurações precisa ser alcançável daqui também).
 *
 * 2026-08-28 (pedido do fundador) — o ícone de "Sair" (porta) voltou para o
 * cabeçalho, à direita, ao lado da engrenagem; só aparece quando há sessão
 * (`tenantId`).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Header from '../../components/Header';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/clientApi', () => ({ logout: jest.fn().mockResolvedValue(undefined) }));

describe('Header (Reorganização Perfil/Configurações)', () => {
  it('sem tenantId (tela de login): não mostra a engrenagem nem o botão Sair', () => {
    render(<Header />);
    expect(screen.queryByLabelText('Configurações')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
  });

  it('com tenantId: mostra a engrenagem, link para /settings', () => {
    render(<Header tenantId="tenant-1" />);
    const link = screen.getByLabelText('Configurações');
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('com tenantId: mostra o botão Sair (porta)', () => {
    render(<Header tenantId="tenant-1" />);
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('não mostra mais e-mail/cargo/trocar senha (migraram para o Perfil)', () => {
    render(<Header tenantId="tenant-1" />);
    expect(screen.queryByText(/trocar senha/i)).not.toBeInTheDocument();
  });
});
