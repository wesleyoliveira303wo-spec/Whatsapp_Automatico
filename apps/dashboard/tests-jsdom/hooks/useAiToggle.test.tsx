/**
 * Fase 1 (2026-08-07) — Botão POWER: `useAiToggle` busca o estado inicial
 * via `fetchAiProfile` e persiste mudanças via `setAiEnabled` (`clientApi`),
 * com atualização OTIMISTA que reverte se a chamada falhar.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAiToggle } from '../../hooks/useAiToggle';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchAiProfile: jest.fn(),
  setAiEnabled: jest.fn(),
}));

const mockFetchAiProfile = clientApi.fetchAiProfile as jest.Mock;
const mockSetAiEnabled = clientApi.setAiEnabled as jest.Mock;

describe('useAiToggle (Fase 1, Botão POWER, 2026-08-07)', () => {
  beforeEach(() => {
    mockFetchAiProfile.mockReset();
    mockSetAiEnabled.mockReset();
  });

  it('começa carregando (aiEnabled: null) e resolve para o valor do perfil', async () => {
    mockFetchAiProfile.mockResolvedValue({ profile: { aiEnabled: false } });
    const { result } = renderHook(() => useAiToggle('vendas'));

    expect(result.current.aiEnabled).toBeNull();
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.aiEnabled).toBe(false);
  });

  it('sessão sem perfil configurado (profile: null): default aiEnabled=true (ligado)', async () => {
    mockFetchAiProfile.mockResolvedValue({ profile: null });
    const { result } = renderHook(() => useAiToggle('vendas'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.aiEnabled).toBe(true);
  });

  it('toggle(): atualiza otimisticamente e chama setAiEnabled com o valor invertido', async () => {
    mockFetchAiProfile.mockResolvedValue({ profile: { aiEnabled: true } });
    mockSetAiEnabled.mockResolvedValue({ profile: { aiEnabled: false } });
    const { result } = renderHook(() => useAiToggle('vendas'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.aiEnabled).toBe(false);
    expect(mockSetAiEnabled).toHaveBeenCalledWith('vendas', false);
  });

  it('toggle() que falha no backend: reverte o estado otimista e expõe errorMessage', async () => {
    mockFetchAiProfile.mockResolvedValue({ profile: { aiEnabled: true } });
    mockSetAiEnabled.mockRejectedValue(new Error('falha de rede'));
    const { result } = renderHook(() => useAiToggle('vendas'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.aiEnabled).toBe(true);
    expect(result.current.errorMessage).toBeTruthy();
  });
});
