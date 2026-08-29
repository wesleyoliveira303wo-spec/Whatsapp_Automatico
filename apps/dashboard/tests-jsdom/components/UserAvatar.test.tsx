/** Reorganização Perfil/Configurações (2026-08-27). */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserAvatar from '../../components/UserAvatar';

describe('UserAvatar', () => {
  it('sem avatarUrl e sem name: mostra as 2 primeiras letras do e-mail', () => {
    render(<UserAvatar email="wesley@empresa.com" />);
    expect(screen.getByText('WE')).toBeInTheDocument();
  });

  it('com name: mostra as iniciais do nome (não do e-mail)', () => {
    render(<UserAvatar email="w@empresa.com" name="Wesley Oliveira" />);
    expect(screen.getByText('WO')).toBeInTheDocument();
    expect(screen.queryByText('W@')).not.toBeInTheDocument();
  });

  it('com avatarUrl: mostra a imagem, não as iniciais', () => {
    render(<UserAvatar email="w@empresa.com" name="Wesley" avatarUrl="https://exemplo.com/foto.jpg" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://exemplo.com/foto.jpg');
    expect(screen.queryByText('W')).not.toBeInTheDocument();
  });

  it('a mesma identidade sempre cai na mesma cor (determinístico)', () => {
    const { container: first } = render(<UserAvatar email="mesma@empresa.com" />);
    const { container: second } = render(<UserAvatar email="mesma@empresa.com" />);
    expect(first.firstChild).toHaveStyle(
      `background-color: ${(second.firstChild as HTMLElement).style.backgroundColor}`,
    );
  });

  // Auditoria do Perfil (2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fase 4) —
  // achado real: uma `avatarUrl` inválida (link expirado, digitado errado)
  // quebrava para o ícone de imagem quebrada do navegador em vez de cair
  // para as iniciais, como acontece quando não há `avatarUrl` nenhuma.
  it('avatarUrl quebrada: cai para as iniciais em vez do ícone de imagem quebrada', () => {
    render(<UserAvatar email="w@empresa.com" name="Wesley Oliveira" avatarUrl="https://exemplo.com/nao-existe.jpg" />);
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('WO')).toBeInTheDocument();
  });

  it('avatarUrl trocada depois de uma quebra: dá nova chance à imagem nova', () => {
    const { rerender } = render(
      <UserAvatar email="w@empresa.com" avatarUrl="https://exemplo.com/velha.jpg" />,
    );
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    rerender(<UserAvatar email="w@empresa.com" avatarUrl="https://exemplo.com/nova.jpg" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://exemplo.com/nova.jpg');
  });
});
