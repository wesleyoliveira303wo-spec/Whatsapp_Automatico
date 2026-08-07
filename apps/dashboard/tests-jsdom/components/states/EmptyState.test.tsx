/**
 * Milestone 6, Bloco M6D-3 — teste do `EmptyState`.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Inbox } from 'lucide-react';
import EmptyState from '../../../components/states/EmptyState';
import { Button } from '../../../components/ui/button';

describe('EmptyState (Milestone 6, Bloco M6D-2)', () => {
  it('renderiza título e descrição', () => {
    render(
      <EmptyState
        title="Nenhuma sessão ainda"
        description="Crie uma sessão para conectar o WhatsApp."
      />,
    );
    expect(screen.getByText('Nenhuma sessão ainda')).toBeInTheDocument();
    expect(screen.getByText('Crie uma sessão para conectar o WhatsApp.')).toBeInTheDocument();
  });

  it('não renderiza ícone quando nenhum é passado', () => {
    const { container } = render(<EmptyState title="Sem ícone" />);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('renderiza o ícone quando passado', () => {
    const { container } = render(<EmptyState title="Com ícone" icon={Inbox} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renderiza a ação quando passada', () => {
    render(<EmptyState title="Com ação" action={<Button>Criar sessão</Button>} />);
    expect(screen.getByRole('button', { name: 'Criar sessão' })).toBeInTheDocument();
  });
});
