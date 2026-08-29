/** Fase Auth/Registro (2026-08-26) — teste do `RegisterForm`. */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RegisterForm from '../../components/RegisterForm';
import * as clientApi from '../../lib/clientApi';

const push = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  registerAccount: jest.fn(),
}));

describe('RegisterForm (Fase Auth/Registro)', () => {
  beforeEach(() => {
    push.mockClear();
    (clientApi.registerAccount as jest.Mock).mockReset();
  });

  it('mostra os 4 campos: nome, e-mail, senha, empresa', () => {
    render(<RegisterForm />);
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByLabelText('Empresa')).toBeInTheDocument();
  });

  it('registra com sucesso e redireciona para /', async () => {
    (clientApi.registerAccount as jest.Mock).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { id: 'user-1', email: 'a@b.com', role: 'owner', mustChangePassword: false },
    });
    render(<RegisterForm />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Maria' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-forte-123' } });
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'Minha Empresa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar minha conta' }));

    await waitFor(() => {
      expect(clientApi.registerAccount).toHaveBeenCalledWith(
        'Maria',
        'a@b.com',
        'senha-forte-123',
        'Minha Empresa',
      );
      expect(push).toHaveBeenCalledWith('/app');
    });
  });

  it('mostra mensagem de erro quando o e-mail ja esta em uso (409)', async () => {
    (clientApi.registerAccount as jest.Mock).mockRejectedValue(
      new clientApi.ClientApiError(409, {}),
    );
    render(<RegisterForm />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Maria' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-forte-123' } });
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'Minha Empresa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar minha conta' }));

    await waitFor(() => {
      expect(screen.getByText(/já está em uso/)).toBeInTheDocument();
    });
  });

  it('mostra o link "Entrar", apontando para /login', () => {
    render(<RegisterForm />);
    const link = screen.getByRole('link', { name: 'Entrar' });
    expect(link).toHaveAttribute('href', '/login');
  });

  // Reconstrução 2026-08-28 (pedido do fundador: "use a mesma regra" do
  // login no registro) — mesmo cabeçalho com ícone/heading do LoginForm.
  it('mostra o cabeçalho "Criar sua conta" com a mensagem de apoio', () => {
    render(<RegisterForm />);
    expect(screen.getByText('Criar sua conta')).toBeInTheDocument();
    expect(
      screen.getByText('Comece a atender pelo Francis em menos de um minuto.'),
    ).toBeInTheDocument();
  });
});
