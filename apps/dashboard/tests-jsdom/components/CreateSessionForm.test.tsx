/**
 * `CreateSessionForm` — o formulário de "Conectar WhatsApp".
 *
 * O que interessa aqui é o caminho de erro: desde o B5 (2026-09-18) a API
 * recusa um WhatsApp novo quando o plano já ocupa todas as vagas (409
 * `session_limit_reached`), e a mensagem que ela devolve é a explicação que a
 * pessoa precisa ler — o formulário tem que mostrá-la, não um texto genérico.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CreateSessionForm from '../../components/CreateSessionForm';
import * as clientApi from '../../lib/clientApi';

const mockPush = jest.fn();

jest.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  connectSession: jest.fn(),
}));

const connectSession = clientApi.connectSession as jest.MockedFunction<
  typeof clientApi.connectSession
>;

function submit(name: string): void {
  fireEvent.change(screen.getByLabelText('Nome da conexão'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /conectar whatsapp/i }));
}

describe('CreateSessionForm', () => {
  beforeEach(() => {
    mockPush.mockReset();
    connectSession.mockReset();
  });

  it('limite do plano atingido: mostra a explicação que a API devolveu e não navega', async () => {
    connectSession.mockRejectedValue(
      new clientApi.ClientApiError(409, {
        error: 'session_limit_reached',
        message:
          'Seu plano permite 1 WhatsApp conectado. Para conectar outro, remova o atual ou mude de plano.',
      }),
    );
    render(<CreateSessionForm />);

    submit('suporte');

    expect(await screen.findByText(/Seu plano permite 1 WhatsApp conectado/)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /conectar whatsapp/i })).toBeEnabled();
  });

  it('sucesso: vai para a tela de conexão daquela sessão, onde o QR Code aparece', async () => {
    connectSession.mockResolvedValue(undefined as never);
    const onSubmitted = jest.fn();
    render(<CreateSessionForm onSubmitted={onSubmitted} />);

    submit('vendas');

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/sessions/vendas/settings/whatsapps?session=vendas'),
    );
    expect(onSubmitted).toHaveBeenCalled();
  });
});
