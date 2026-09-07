import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

import { TenantSignalBadge } from '@/components/admin/TenantSignalBadge';
import type { TenantSignal } from '@/lib/platformClientApi';

function signal(patch: Partial<TenantSignal> = {}): TenantSignal {
  return {
    key: 'disconnected',
    severity: 'red',
    label: 'Desconectado',
    reading: 'Tinha conexão e caiu.',
    ...patch,
  };
}

describe('TenantSignalBadge', () => {
  it('mostra o rótulo do sinal — cor nunca aparece sozinha', () => {
    render(<TenantSignalBadge signal={signal()} />);
    expect(screen.getByText('Desconectado')).toBeInTheDocument();
  });

  it('a leitura vira title (dica ao passar o mouse)', () => {
    render(<TenantSignalBadge signal={signal({ reading: 'Usou e abandonou.' })} />);
    expect(screen.getByText('Desconectado')).toHaveAttribute('title', 'Usou e abandonou.');
  });

  it('a classe de cor acompanha a severidade', () => {
    const { rerender } = render(<TenantSignalBadge signal={signal({ severity: 'red' })} />);
    expect(screen.getByText('Desconectado').className).toContain('text-destructive');

    rerender(
      <TenantSignalBadge signal={signal({ severity: 'amber', label: 'Nunca começou' })} />,
    );
    expect(screen.getByText('Nunca começou').className).toContain('text-warning');

    rerender(<TenantSignalBadge signal={signal({ severity: 'green', label: 'Saudável' })} />);
    expect(screen.getByText('Saudável').className).toContain('text-success');
  });
});
