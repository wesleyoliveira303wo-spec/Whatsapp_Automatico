/**
 * `useSharedPoll` (2026-09-17): um poll por chave, não por componente. Medido
 * no navegador antes da correção — uma conversa aberta fazia ~90 requisições
 * por minuto porque dois painéis montavam os mesmos hooks, cada um com o
 * próprio temporizador.
 */
import { act, renderHook } from '@testing-library/react';
import { useSharedPoll } from '../../hooks/useSharedPoll';
import { useWaitingForHuman } from '../../hooks/useWaitingForHuman';
import * as clientApi from '../../lib/clientApi';
import * as notify from '../../lib/notify';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchConversations: jest.fn(),
}));
jest.mock('../../lib/notify', () => ({
  ensureNotificationPermission: jest.fn(),
  playAlertSound: jest.fn(),
  showBrowserNotification: jest.fn(),
}));

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useSharedPoll', () => {
  it('dois componentes na mesma chave fazem UMA busca e recebem o mesmo dado', async () => {
    const fetcher = jest.fn().mockResolvedValue('dado');
    const first = renderHook(() => useSharedPoll('chave', fetcher, 4000));
    const second = renderHook(() => useSharedPoll('chave', fetcher, 4000));
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.result.current.data).toBe('dado');
    expect(second.result.current.data).toBe('dado');

    first.unmount();
    second.unmount();
  });

  it('um temporizador só por chave, não importa quantos componentes', async () => {
    const fetcher = jest.fn().mockResolvedValue('dado');
    const first = renderHook(() => useSharedPoll('chave', fetcher, 4000));
    const second = renderHook(() => useSharedPoll('chave', fetcher, 4000));
    await flush();

    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(2); // 1ª carga + 1 tick, não 2 ticks

    first.unmount();
    second.unmount();
  });

  it('quando o último componente sai, o poll para', async () => {
    const fetcher = jest.fn().mockResolvedValue('dado');
    const { unmount } = renderHook(() => useSharedPoll('chave', fetcher, 4000));
    await flush();
    unmount();

    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('setData de um componente chega a todos os inscritos', async () => {
    const fetcher = jest.fn().mockResolvedValue('antigo');
    const first = renderHook(() => useSharedPoll<string>('chave', fetcher, 4000));
    const second = renderHook(() => useSharedPoll<string>('chave', fetcher, 4000));
    await flush();

    act(() => first.result.current.setData('novo'));

    expect(second.result.current.data).toBe('novo');

    first.unmount();
    second.unmount();
  });

  it('erro num poll mantém o último dado bom', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce('bom').mockRejectedValueOnce(new Error('caiu'));
    const { result, unmount } = renderHook(() => useSharedPoll('chave', fetcher, 4000));
    await flush();

    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    await flush();

    expect(result.current.data).toBe('bom');
    expect(result.current.error).toBeInstanceOf(Error);

    unmount();
  });

  it('o fetcher recebe o dado anterior da mesma chave', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const { unmount } = renderHook(() => useSharedPoll('chave', fetcher, 4000));
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    await flush();

    expect(fetcher).toHaveBeenNthCalledWith(1, undefined);
    expect(fetcher).toHaveBeenNthCalledWith(2, 1);

    unmount();
  });
});

describe('useWaitingForHuman montado em dois lugares', () => {
  it('uma escalada nova toca o alerta UMA vez, não uma por componente', async () => {
    const escalated = {
      id: 'c1',
      sessionName: 'vendas',
      escalatedAt: '2026-09-17T10:00:00.000Z',
    };
    (clientApi.fetchConversations as jest.Mock)
      .mockResolvedValueOnce({ conversations: [] })
      .mockResolvedValueOnce({ conversations: [escalated] });

    const rail = renderHook(() => useWaitingForHuman());
    const tab = renderHook(() => useWaitingForHuman());
    await flush();

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await flush();

    expect(clientApi.fetchConversations).toHaveBeenCalledTimes(2);
    expect(notify.playAlertSound).toHaveBeenCalledTimes(1);
    expect(rail.result.current.countBySession).toEqual({ vendas: 1 });
    expect(tab.result.current.count).toBe(1);

    rail.unmount();
    tab.unmount();
  });
});
