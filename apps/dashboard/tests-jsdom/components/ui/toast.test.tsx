/**
 * Milestone 6, Bloco M6C-5 — teste do `Toaster` + `useToast`. `toast(...)`
 * é uma função de MÓDULO (store fora do React), então basta chamá-la dentro
 * de `act()` e renderizar `<Toaster />` para ver o resultado — não precisa
 * de um componente disparador real.
 */
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Toaster } from '../../../components/ui/toaster';
import { toast } from '../../../components/ui/use-toast';

describe('Toaster + useToast (Milestone 6, Bloco M6C-3)', () => {
  it('não mostra nada antes de qualquer toast() ser chamado', () => {
    render(<Toaster />);
    expect(screen.queryByText('Salvo')).not.toBeInTheDocument();
  });

  it('mostra título e descrição depois de toast(...)', async () => {
    render(<Toaster />);

    act(() => {
      toast({ title: 'Salvo', description: 'Perfil atualizado com sucesso.' });
    });

    await waitFor(() => {
      expect(screen.getByText('Salvo')).toBeInTheDocument();
    });
    expect(screen.getByText('Perfil atualizado com sucesso.')).toBeInTheDocument();
  });
});
