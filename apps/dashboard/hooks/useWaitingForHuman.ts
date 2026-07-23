import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchConversations } from '../lib/clientApi';
import { usePollingRefresh } from './usePollingRefresh';
import { ensureNotificationPermission, playAlertSound, showBrowserNotification } from '../lib/notify';

export interface UseWaitingForHumanResult {
  /** Quantas conversas estão em "human" SEM dono — ou seja, aguardando um atendente assumir. */
  count: number;
}

/**
 * Acompanha, em tempo real, a fila de conversas AGUARDANDO atendimento humano
 * (feature N2). "Aguardando" = `status: 'human'` E sem dono (`assignedToUserId`
 * ausente) — é o estado em que a IA deixa a conversa ao auto-escalar, antes de
 * alguém assumir.
 *
 * Quando o número SOBE entre duas checagens (chegou conversa nova na fila),
 * dispara um som + notificação do navegador. Só toca no aumento (não a cada
 * poll), e nunca no primeiro carregamento (não alarma com a fila que já
 * existia). Pensado para viver na Sidebar (montada em toda página protegida),
 * então o alerta funciona esteja o operador em qualquer tela.
 */
export function useWaitingForHuman(): UseWaitingForHumanResult {
  const [count, setCount] = useState(0);
  const previousCountRef = useRef<number | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const { conversations } = await fetchConversations({ status: 'human', limit: 200 });
      setCount(conversations.filter((conversation) => !conversation.assignedToUserId).length);
    } catch {
      // Silencioso: um poll que falhou não deve quebrar a navegação nem zerar o
      // contador (mantém o último valor bom).
    }
  }, []);

  useEffect(() => {
    ensureNotificationPermission();
    void load();
  }, [load]);

  usePollingRefresh(load, 5000);

  useEffect(() => {
    const previous = previousCountRef.current;
    if (previous !== null && count > previous) {
      const novas = count - previous;
      playAlertSound();
      showBrowserNotification(
        'Atendimento humano necessário',
        novas === 1 ? 'Uma conversa está aguardando um atendente.' : `${novas} conversas aguardando um atendente.`,
      );
    }
    previousCountRef.current = count;
  }, [count]);

  return { count };
}
