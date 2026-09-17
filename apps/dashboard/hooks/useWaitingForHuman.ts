import { useEffect, useMemo } from 'react';
import { fetchConversations } from '../lib/clientApi';
import type { ConversationSummary } from '../lib/clientApi';
import { useSharedPoll } from './useSharedPoll';
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
 * Busca a fila e toca o alerta — roda UMA vez por poll, não uma vez por
 * componente (2026-09-17): com o hook montado no rail E na aba WhatsApps, o
 * alerta de uma única escalada tocava duas vezes. `previous` é a fila da busca
 * anterior (`undefined` na 1ª, que nunca alarma).
 */
async function fetchWaitingQueue(
  previous: ConversationSummary[] | undefined,
): Promise<ConversationSummary[]> {
  const { conversations } = await fetchConversations({ needsHumanAttention: true, limit: 200 });
  if (previous !== undefined) {
    const seen = new Set(previous.map(escalationKey));
    const newOnes = conversations.filter((conversation) => !seen.has(escalationKey(conversation)));
    if (newOnes.length > 0) {
      playAlertSound();
      showBrowserNotification(
        'Atendimento humano necessário',
        newOnes.length === 1
          ? 'Uma conversa está aguardando um atendente.'
          : `${newOnes.length} conversas aguardando um atendente.`,
      );
    }
  }
  return conversations;
}

function escalationKey(conversation: ConversationSummary): string {
  return `${conversation.id}:${conversation.escalatedAt}`;
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
 * Milestone 6, Bloco M6H-1: este hook é montado em MAIS de um lugar (rail
 * da sessão, Workspace, aba WhatsApps). Desde 2026-09-17 todas as montagens
 * compartilham UM poll (`useSharedPoll`) — antes cada uma tinha o seu, e o
 * alerta sonoro tocava uma vez por montagem.
 */
export function useWaitingForHuman(): UseWaitingForHumanResult {
  // Falha num poll mantém a última fila boa (`useSharedPoll` nunca apaga o
  // dado por causa de um erro) — não quebra a navegação nem zera o contador.
  const { data } = useSharedPoll('waiting-for-human', fetchWaitingQueue, 5000);

  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  const conversations = data ?? EMPTY_QUEUE;
  const countBySession = useMemo(
    () =>
      conversations.reduce<Record<string, number>>((acc, conversation) => {
        acc[conversation.sessionName] = (acc[conversation.sessionName] ?? 0) + 1;
        return acc;
      }, {}),
    [conversations],
  );

  return { count: conversations.length, countBySession };
}

const EMPTY_QUEUE: ConversationSummary[] = [];
