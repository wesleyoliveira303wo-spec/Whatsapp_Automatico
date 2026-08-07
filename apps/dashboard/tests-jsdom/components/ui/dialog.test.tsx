/**
 * Milestone 6, Bloco M6C-5 — testes do primitivo `Dialog` (Modal). Foco
 * preso, ESC pra fechar e ARIA vêm do Radix — o teste verifica só a
 * integração (abre via trigger, mostra título/descrição, fecha via botão).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from '../../../components/ui/dialog';

describe('Dialog (Milestone 6, Bloco M6C-2)', () => {
  it('fica fechado por padrão e abre ao clicar no trigger', async () => {
    render(
      <Dialog>
        <DialogTrigger>Remover sessão</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover sessão?</DialogTitle>
            <DialogDescription>Essa ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>Confirmar</DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByText('Remover sessão?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Remover sessão'));

    await waitFor(() => {
      expect(screen.getByText('Remover sessão?')).toBeInTheDocument();
    });
    expect(screen.getByText('Essa ação não pode ser desfeita.')).toBeInTheDocument();
  });

  it('renderiza aberto quando controlado via prop open', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Já aberto</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('Já aberto')).toBeInTheDocument();
  });

  it('fecha ao clicar no botão de fechar (X) — defaultOpen (não-controlado), para o Radix gerenciar o próprio estado', async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Fechável</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    fireEvent.click(screen.getByText('Fechar'));
    await waitFor(() => {
      expect(screen.queryByText('Fechável')).not.toBeInTheDocument();
    });
  });
});
