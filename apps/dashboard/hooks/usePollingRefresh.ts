import { useEffect } from 'react';

/** Intervalo padrão de atualização em tempo real (ms). ~4s: fresco o bastante para atendimento, leve o bastante para o polling do BFF. */
export const DEFAULT_POLL_INTERVAL_MS = 4000;

/**
 * Chama `refresh()` num intervalo fixo — o "tempo real" da Dashboard (feature
 * N2). Pausa quando a aba fica oculta (`visibilitychange`) e dispara um refresh
 * imediato quando ela volta a ficar visível, para não gastar requisições com o
 * operador longe da tela e trazer o estado em dia assim que ele volta.
 *
 * `refresh` deve ser estável (memoizado com `useCallback`) — todos os hooks de
 * detalhe deste projeto já expõem um `refresh` assim.
 */
export function usePollingRefresh(
  refresh: () => void,
  intervalMs: number = DEFAULT_POLL_INTERVAL_MS,
): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    let timer: ReturnType<typeof setInterval> | undefined;
    const start = (): void => {
      if (timer === undefined) timer = setInterval(refresh, intervalMs);
    };
    const stop = (): void => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refresh, intervalMs]);
}
