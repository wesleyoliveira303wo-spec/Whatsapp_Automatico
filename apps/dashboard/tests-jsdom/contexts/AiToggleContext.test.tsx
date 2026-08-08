/**
 * Fase 1 (2026-08-07, 2ª rodada) — correção do achado real do fundador:
 * clicar no Botão POWER (cabeçalho) não atualizava os selos das conversas
 * até um F5, porque cada um tinha sua PRÓPRIA instância de `useAiToggle`.
 * Este teste prova o fix: dois consumidores dentro do MESMO
 * `AiToggleProvider` compartilham o estado — um `toggle()` chamado por um
 * lado aparece IMEDIATAMENTE no outro, sem novo fetch.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AiToggleProvider, useAiToggleContext } from '../../contexts/AiToggleContext';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchAiProfile: jest.fn(),
  setAiEnabled: jest.fn(),
}));

const mockFetchAiProfile = clientApi.fetchAiProfile as jest.Mock;
const mockSetAiEnabled = clientApi.setAiEnabled as jest.Mock;

/** Consumidor A — como `AiPowerToggle` (cabeçalho): só lê e chama toggle(). */
function ButtonConsumer(): JSX.Element {
  const { aiEnabled, toggle } = useAiToggleContext();
  return (
    <button type="button" onClick={() => void toggle()}>
      {aiEnabled === null ? 'carregando' : aiEnabled ? 'ligado' : 'desligado'}
    </button>
  );
}

/** Consumidor B — como `ConversationInbox`/selos de conversa: só lê. */
function TagConsumer(): JSX.Element {
  const { aiEnabled } = useAiToggleContext();
  return (
    <span>{aiEnabled === null ? 'carregando' : aiEnabled ? 'IA ligada' : 'IA desativada'}</span>
  );
}

describe('AiToggleContext (correção 2026-08-07, 2ª rodada — estado compartilhado)', () => {
  beforeEach(() => {
    mockFetchAiProfile.mockReset();
    mockSetAiEnabled.mockReset();
  });

  it('clicar no botão de um consumidor atualiza o outro consumidor na mesma renderização, sem F5/novo fetch', async () => {
    mockFetchAiProfile.mockResolvedValue({ profile: { aiEnabled: true } });
    mockSetAiEnabled.mockResolvedValue({ profile: { aiEnabled: false } });

    render(
      <AiToggleProvider sessionName="vendas">
        <ButtonConsumer />
        <TagConsumer />
      </AiToggleProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('ligado'));
    expect(screen.getByText('IA ligada')).toBeInTheDocument();
    expect(mockFetchAiProfile).toHaveBeenCalledTimes(1); // UMA busca, não uma por consumidor.

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('desligado'));
    // O segundo consumidor (selos) reflete o novo estado imediatamente.
    expect(screen.getByText('IA desativada')).toBeInTheDocument();
  });

  it('useAiToggleContext() fora de um AiToggleProvider lança um erro claro', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ButtonConsumer />)).toThrow(/AiToggleProvider/);
    consoleError.mockRestore();
  });
});
