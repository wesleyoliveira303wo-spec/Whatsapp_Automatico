/** Reorganização Perfil/Configurações (2026-08-27). */
import { render, screen } from '@testing-library/react';
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
});
