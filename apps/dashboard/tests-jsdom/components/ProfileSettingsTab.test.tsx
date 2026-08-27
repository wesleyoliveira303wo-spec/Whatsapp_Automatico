/**
 * Reorganização Perfil/Configurações (2026-08-27) — aba "Perfil" (Minha
 * conta/Segurança/Preferências). Item 13 da missão: prova que os dados
 * exibidos pertencem ao usuário LOGADO (via `useMe`), e que editar o
 * próprio nome/foto chama a API certa.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfileSettingsTab from '../../components/ProfileSettingsTab';
import * as useMeModule from '../../hooks/useMe';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../hooks/useMe');
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchTenant: jest.fn(),
  updateMyProfile: jest.fn(),
  updateTenantName: jest.fn(),
  logout: jest.fn(),
}));

const mockUseMe = useMeModule.useMe as jest.Mock;

describe('ProfileSettingsTab', () => {
  beforeEach(() => {
    (clientApi.fetchTenant as jest.Mock).mockResolvedValue({
      tenant: { id: 't1', name: 'Empresa Teste' },
    });
    (clientApi.updateMyProfile as jest.Mock).mockReset();
  });

  it('mostra e-mail, cargo e empresa do usuário LOGADO (useMe)', async () => {
    mockUseMe.mockReturnValue({
      user: {
        id: 'u1',
        email: 'wesley@empresa.com',
        role: 'owner',
        mustChangePassword: false,
      },
    });
    render(<ProfileSettingsTab />);
    // Aparece 2x: como título (sem nome, cai no e-mail) e no campo "E-mail".
    expect(screen.getAllByText('wesley@empresa.com').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Dono/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Empresa Teste/)).toBeInTheDocument();
    });
  });

  it('sessão de API key (user: null): não renderiza nada', () => {
    mockUseMe.mockReturnValue({ user: null });
    const { container } = render(<ProfileSettingsTab />);
    expect(container).toBeEmptyDOMElement();
  });

  it('edita o nome e salva via updateMyProfile', async () => {
    mockUseMe.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'operator', mustChangePassword: false },
    });
    (clientApi.updateMyProfile as jest.Mock).mockResolvedValue({
      tenantId: 't1',
      user: { id: 'u1', email: 'a@b.com', role: 'operator', mustChangePassword: false, name: 'Ana' },
    });
    render(<ProfileSettingsTab />);

    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(clientApi.updateMyProfile).toHaveBeenCalledWith({ name: 'Ana', avatarUrl: '' });
      expect(screen.getByText('Perfil atualizado.')).toBeInTheDocument();
    });

    // Regressão (achado ao testar manualmente nesta sessão): `useMe()` só
    // busca uma vez por montagem — sem sobrepor com o retorno da API, o
    // título continuaria mostrando "a@b.com" (o e-mail) mesmo depois de
    // salvar "Ana" como nome, até um F5.
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('a@b.com', { selector: 'p.font-semibold' })).not.toBeInTheDocument();
  });

  // 2ª rodada (2026-08-27): "Empresa" deixou de ser aba própria e virou uma
  // seção DENTRO de Perfil.
  it('inclui a seção Empresa (não é mais uma aba separada)', async () => {
    mockUseMe.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'owner', mustChangePassword: false },
    });
    render(<ProfileSettingsTab canManageCompany />);
    await waitFor(() => {
      expect(screen.getByText('Empresa')).toBeInTheDocument();
      expect(screen.getByLabelText('Nome da empresa')).toBeInTheDocument();
    });
  });

  it('sem tenant:manage: campo da empresa fica somente-leitura', async () => {
    mockUseMe.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'operator', mustChangePassword: false },
    });
    render(<ProfileSettingsTab canManageCompany={false} />);
    await waitFor(() => {
      expect(screen.getByLabelText('Nome da empresa')).toBeDisabled();
    });
  });
});
