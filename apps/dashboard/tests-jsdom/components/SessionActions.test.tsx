/**
 * Milestone 6, Bloco M6E-3 — teste do `SessionActions` (retrofit M6E-1):
 * confirmação de remoção migrada de `window.confirm` para `Dialog`.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionActions from '../../components/SessionActions';
import * as clientApi from '../../lib/clientApi';

const push = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  connectSession: jest.fn(),
  disconnectSession: jest.fn(),
  removeSession: jest.fn(),
}));

describe('SessionActions (Milestone 6, Bloco M6E-1)', () => {
  beforeEach(() => {
    push.mockClear();
    (clientApi.connectSession as jest.Mock).mockReset().mockResolvedValue(undefined);
    (clientApi.disconnectSession as jest.Mock).mockReset().mockResolvedValue(undefined);
    (clientApi.removeSession as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  it('mostra "Reconectar" quando desconectada e "Desconectar" quando conectada', () => {
    const { rerender } = render(<SessionActions sessionName="vendas" status="disconnected" />);
    expect(screen.getByRole('button', { name: 'Reconectar' })).toBeInTheDocument();

    rerender(<SessionActions sessionName="vendas" status="connected" />);
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeInTheDocument();
  });

  it('abre o dialog de confirmação ao clicar em "Remover sessão" e cancela sem remover', () => {
    render(<SessionActions sessionName="vendas" status="connected" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover sessão' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Remover a sessão/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(clientApi.removeSession).not.toHaveBeenCalled();
  });

  it('remove a sessão e navega para "/" ao confirmar no dialog', async () => {
    render(<SessionActions sessionName="vendas" status="connected" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover sessão' }));

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover definitivamente' }));

    await waitFor(() => {
      expect(clientApi.removeSession).toHaveBeenCalledWith('vendas');
      expect(push).toHaveBeenCalledWith('/');
    });
  });
});
