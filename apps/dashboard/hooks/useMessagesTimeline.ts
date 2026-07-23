import { useCallback, useEffect, useState } from 'react';
import { fetchConversationMessages } from '../lib/clientApi';
import { usePollingRefresh } from './usePollingRefresh';
import type { ConversationMessage } from '../lib/clientApi';

export interface UseMessagesTimelineResult {
  messages: ConversationMessage[] | null;
  errorMessage: string | null;
  refresh: () => void;
}

/**
 * Timeline de mensagens de uma conversa (Milestone 3, Bloco 6 — D23):
 * fetch simples por montagem + `refresh()` manual, deliberadamente SEM SSE
 * — mesmo padrao/racional de `HistoryList` (M2, Fase 4): consulta de
 * leitura, nao dado que precise de atualizacao a cada ~2s. A API ja devolve
 * em ordem cronologica (mais antiga primeiro — inversao feita no
 * `ConversationsService`, D12 do Bloco 5), nada a reordenar aqui.
 */
export function useMessagesTimeline(conversationId: string | null, limit?: number): UseMessagesTimelineResult {
  const [messages, setMessages] = useState<ConversationMessage[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setErrorMessage(null);
    fetchConversationMessages(conversationId, limit)
      .then(({ messages: fetched }) => {
        if (!cancelled) setMessages(fetched);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Falha ao carregar as mensagens.');
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, limit, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  // Tempo real (N2-4): a timeline se atualiza sozinha, sem F5. A atualização é
  // silenciosa (não zera `messages`, só substitui pela lista nova), então não
  // pisca. Sobrepõe a decisão antiga "SEM SSE" — agora o atendente precisa ver
  // as mensagens da IA/cliente chegando ao vivo.
  usePollingRefresh(refresh);

  return { messages, errorMessage, refresh };
}
