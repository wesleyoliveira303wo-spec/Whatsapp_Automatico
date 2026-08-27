/**
 * Milestone 6, Bloco M6F — teste do `LoginForm` (redesign de Product Design).
 * Comportamento (2 modos, submit, redirect, erro) inalterado; muda só a casca
 * visual e o fluxo de acesso à API Key (recolhido em "Outras formas de acesso").
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoginForm from '../../components/LoginForm';
import * as clientApi from '../../lib/clientApi';

const push = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  login: jest.fn(),
  loginWithPassword: jest.fn(),
}));

describe('LoginForm (Milestone 6, Bloco M6F)', () => {
  beforeEach(() => {
    push.mockClear();
    (clientApi.login as jest.Mock).mockReset().mockResolvedValue(undefined);
    (clientApi.loginWithPassword as jest.Mock).mockReset();
  });

  it('mostra e-mail e senha no modo padrão (pessoa)', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
  });

  it('alterna a senha entre oculta e visível', () => {
    render(<LoginForm />);
    const input = screen.getByLabelText('Senha') as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(input.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(input.type).toBe('password');
  });

  it('revela e ativa o modo API Key via "Outras formas de acesso"', () => {
    render(<LoginForm />);
    expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Outras formas de acesso'));
    fireEvent.click(screen.getByText(/Entrar com API Key/));
    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
  });

  it('faz login com e-mail/senha (sem tenantId, Fase Auth/Registro) e redireciona para /', async () => {
    (clientApi.loginWithPassword as jest.Mock).mockResolvedValue({
      user: { mustChangePassword: false },
    });
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(clientApi.loginWithPassword).toHaveBeenCalledWith('a@b.com', 'segredo');
      expect(push).toHaveBeenCalledWith('/');
    });
  });

  it('redireciona para /change-password quando a senha é provisória', async () => {
    (clientApi.loginWithPassword as jest.Mock).mockResolvedValue({
      user: { mustChangePassword: true },
    });
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'provisoria' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/change-password');
    });
  });

  it('mostra mensagem de erro em 401', async () => {
    (clientApi.loginWithPassword as jest.Mock).mockRejectedValue(
      new clientApi.ClientApiError(401, {}),
    );
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(screen.getByText('E-mail ou senha inválidos.')).toBeInTheDocument();
    });
  });

  it('mostra o link "Criar minha conta" no modo pessoa, apontando para /register', () => {
    render(<LoginForm />);
    const link = screen.getByRole('link', { name: 'Criar minha conta' });
    expect(link).toHaveAttribute('href', '/register');
  });
});
