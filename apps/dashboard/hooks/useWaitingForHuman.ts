import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchConversations } from '../lib/clientApi';
import { usePollingRefresh } from './usePollingRefresh';
import {
  ensureNotificationPermission,
  playAlertSound,
  showBrowserNotification,
} from '../lib/notify';

export interface UseWaitingForHumanResult {
  /** Quantas conversas têm `escalatedAt` definido — ou seja, a IA pediu atenção humana e ninguém assumiu ainda. */
  count: number;
  /**
   * Milestone 6, Bloco M6H-1 — o mesmo total quebrado por `sessionName`
   * (`ConversationSummary` já carrega esse campo; nenhuma chamada extra à
   * API). Alimenta o indicador "N aguardando" em cada card do Workspace
   * (`WhatsAppAccountCard`) sem precisar de um endpoint novo.
   */
  countBySession: Record<string, number>;
}

/**
 * Acompanha, em tempo real, a fila de conversas AGUARDANDO atenção humana.
 *
 * Reforma do escalonamento (2026-07-25): "aguardando" deixou de ser
 * `status: 'human'` sem dono (a IA já não muda mais `status` ao pedir
 * ajuda) e passou a ser `escalatedAt` definido — a IA continua respondendo
 * a conversa normalmente enquanto está sinalizada; só some da fila quando
 * um humano de fato assume (`ConversationsService.escalateConversation`
 * limpa `escalatedAt`).
 *
 * Alerta sonoro/notificação: em vez de "o total subiu" (heurística antiga,
 * cega a uma escalada REPETIDA na MESMA conversa — o total não muda se ela
 * já estava na fila), rastreia por `id + escalatedAt` de cada conversa
 * sinalizada. Qualquer combinação nova (conversa nunca vista OU
 * `escalatedAt` mudou desde a última checagem — segunda pergunta que a IA
 * também não soube responder) dispara o alerta. Nunca alarma no 1º
 * carregamento (só registra o que já existia, sem tocar som).
 *
 * Milestone 6, Bloco M6H-1: com a extinção da Sidebar única (agora há
 * Workspace sem sidebar + `SessionSidebar` por sessão), este hook passou a
 * ser montado em MAIS de um lugar (`pages/index.tsx` e `SessionSidebar`) —
 * cada montagem faz seu próprio polling independente, mesmo padrão que já
 * existia implicitamente (a Sidebar antiga remontava a cada navegação entre
 * páginas protegidas, então o polling nunca foi de fato "único"). O alerta
 * sonoro/notificação continua funcionando em qualquer tela onde o hook esteja
 * montado.
 */
export function useWaitingForHuman(): UseWaitingForHumanResult {
  const [count, setCount] = useState(0);
  const [countBySession, setCountBySession] = useState<Record<string, number>>({});
  const seenEscalationsRef = useRef<Set<string> | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const { conversations } = await fetchConversations({ needsHumanAttention: true, limit: 200 });
      setCount(conversations.length);
      setCountBySession(
        conversations.reduce<Record<string, number>>((acc, conversation) => {
          acc[conversation.sessionName] = (acc[conversation.sessionName] ?? 0) + 1;
          return acc;
        }, {}),
      );

      const currentKeys = new Set(
        conversations.map((conversation) => `${conversation.id}:${conversation.escalatedAt}`),
      );
      const seen = seenEscalationsRef.current;
      if (seen === null) {
        // 1ª carga: só registra o que já existia — não alarma com a fila que já estava lá.
        seenEscalationsRef.current = currentKeys;
        return;
      }
      const newOnes = [...currentKeys].filter((key) => !seen.has(key));
      seenEscalationsRef.current = currentKeys;
      if (newOnes.length > 0) {
        playAlertSound();
        showBrowserNotification(
          'Atendimento humano necessário',
          newOnes.length === 1
            ? 'Uma conversa está aguardando um atendente.'
            : `${newOnes.length} conversas aguardando um atendente.`,
        );
      }
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

  return { count, countBySession };
}
