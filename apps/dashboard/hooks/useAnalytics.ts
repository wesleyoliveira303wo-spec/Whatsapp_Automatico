import { useEffect, useState } from 'react';
import {
  fetchAiUsageAnalytics,
  fetchMessagesAnalytics,
  fetchConversationsAnalytics,
} from '../lib/clientApi';
import type {
  AiUsagePoint,
  MessageFlowPoint,
  NewConversationsPoint,
  ConversationStatusCounts,
  AnalyticsRangeQuery,
} from '../lib/clientApi';

/**
 * Hooks de analytics (Milestone 4, Bloco M4E — D23/D50): fetch simples por
 * faixa de tempo, SEM SSE (analytics e leitura agregada sob demanda, mesmo
 * padrao de HistoryList/useAiInteractions) e SEM cache (D51 se aplica ao
 * backend, mas o espirito read-only/derivado vale ponta a ponta — trocar a
 * faixa refaz a consulta). Agrupados num arquivo por serem 3 variacoes
 * identicas do mesmo padrao minimo.
 */

interface AnalyticsFetchState<T> {
  data: T | null;
  errorMessage: string | null;
}

function useAnalyticsFetch<T>(range: AnalyticsRangeQuery, fetcher: (range: AnalyticsRangeQuery) => Promise<T>): AnalyticsFetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setErrorMessage(null);
    fetcher({ from: range.from, to: range.to })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Falha ao carregar os dados de analytics.');
      });
    return () => {
      cancelled = true;
    };
    // `fetcher` e funcao de modulo (referencia estavel) — incluida na lista
    // por correcao, mas na pratica so a faixa dispara re-fetch.
  }, [range.from, range.to, fetcher]);

  return { data, errorMessage };
}

export function useAiUsageAnalytics(range: AnalyticsRangeQuery): AnalyticsFetchState<{ points: AiUsagePoint[] }> {
  return useAnalyticsFetch(range, fetchAiUsageAnalytics);
}

export function useMessagesAnalytics(range: AnalyticsRangeQuery): AnalyticsFetchState<{ points: MessageFlowPoint[] }> {
  return useAnalyticsFetch(range, fetchMessagesAnalytics);
}

export function useConversationsAnalytics(
  range: AnalyticsRangeQuery,
): AnalyticsFetchState<{ newConversations: NewConversationsPoint[]; statusCounts: ConversationStatusCounts }> {
  return useAnalyticsFetch(range, fetchConversationsAnalytics);
}
