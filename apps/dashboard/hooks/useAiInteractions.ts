import { useMemo } from 'react';
import { fetchAiInteractions } from '../lib/clientApi';
import { useSharedPoll } from './useSharedPoll';
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
export function useAiInteractions(
  conversationId: string | null,
  limit?: number,
): UseAiInteractionsResult {
  // Compartilhado por conversa (2026-09-17, ver `useSharedPoll`): o painel
  // central e o de contexto pediam a mesma lista em polls separados. Agora a
  // busca é uma só (limite padrão da API, 50, mais recentes primeiro) e o
  // `limit` recorta no cliente — as N primeiras são as N mais recentes.
  const { data, error, refresh } = useSharedPoll(
    conversationId ? `ai-interactions:${conversationId}` : null,
    () => fetchAiInteractions(conversationId as string),
  );

  const interactions = useMemo(() => {
    if (!data) return null;
    return limit ? data.interactions.slice(0, limit) : data.interactions;
  }, [data, limit]);

  return {
    interactions,
    errorMessage: error !== undefined ? 'Falha ao carregar as interacoes de IA.' : null,
    refresh,
  };
}
