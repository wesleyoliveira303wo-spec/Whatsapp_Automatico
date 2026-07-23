import { useCallback, useEffect, useState } from 'react';
import { fetchAiInteractions } from '../lib/clientApi';
import { usePollingRefresh } from './usePollingRefresh';
import type { AiInteractionSummary } from '../lib/clientApi';

export interface UseAiInteractionsResult {
  interactions: AiInteractionSummary[] | null;
  errorMessage: string | null;
  refresh: () => void;
}

/**
 * Interacoes de IA de uma conversa (Milestone 3, Bloco 6 — D27/D28): um
 * UNICO fetch por montagem (`GET /api/ai-interactions?conversationId=`) —
 * a correlacao Message <-> AiInteraction e feita no cliente, por
 * `messageId`, sobre esta mesma lista (D27; o proprio Domain de
 * `AiInteraction` documenta esse uso). Sem SSE (D23: dado de auditoria,
 * mesmo padrao de `HistoryList`).
 */
export function useAiInteractions(conversationId: string | null, limit?: number): UseAiInteractionsResult {
  const [interactions, setInteractions] = useState<AiInteractionSummary[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setErrorMessage(null);
    fetchAiInteractions(conversationId, limit)
      .then(({ interactions: fetched }) => {
        if (!cancelled) setInteractions(fetched);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Falha ao carregar as interacoes de IA.');
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, limit, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  // Tempo real (N2-4): acompanha as respostas da IA chegando ao vivo, junto da
  // timeline de mensagens. Atualização silenciosa (não pisca).
  usePollingRefresh(refresh);

  return { interactions, errorMessage, refresh };
}
