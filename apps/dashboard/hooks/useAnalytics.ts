import { useEffect, useState } from 'react';
import {
  fetchAiUsageAnalytics,
  fetchMessagesAnalytics,
  fetchConversationsAnalytics,
  fetchPipelineFunnelAnalytics,
  fetchEscalationRateAnalytics,
  fetchSessionStabilityAnalytics,
} from '../lib/clientApi';
import type {
  AiUsagePoint,
  MessageFlowPoint,
  NewConversationsPoint,
  ConversationStatusCounts,
  PipelineFunnelCounts,
  EscalationRatePoint,
  SessionStabilityPoint,
  AnalyticsRangeQuery,
} from '../lib/clientApi';

/**
 * Hooks de analytics (Milestone 4, Bloco M4E — D23/D50): fetch simples por
 * faixa de tempo, SEM SSE (analytics e leitura agregada sob demanda, mesmo
 * padrao de HistoryList/useAiInteractions) e SEM cache (D51 se aplica ao
 * backend, mas o espirito read-only/derivado vale ponta a ponta — trocar a
 * faixa refaz a consulta). Agrupados num arquivo por serem 3 variacoes
 * identicas do mesmo padrao minimo.
 *
 * Milestone 6, Bloco M6H-4 (2026-07-26): todos os hooks passaram a exigir
 * `sessionName` — trocar de sessao tambem refaz a consulta (mesmo racional
 * de trocar a faixa de tempo).
 */

interface AnalyticsFetchState<T> {
  data: T | null;
  errorMessage: string | null;
}

function useAnalyticsFetch<T>(
  sessionName: string,
  range: AnalyticsRangeQuery,
  fetcher: (sessionName: string, range: AnalyticsRangeQuery) => Promise<T>,
): AnalyticsFetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setErrorMessage(null);
    fetcher(sessionName, { from: range.from, to: range.to })
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
    // por correcao, mas na pratica so sessionName/faixa disparam re-fetch.
  }, [sessionName, range.from, range.to, fetcher]);

  return { data, errorMessage };
}

export function useAiUsageAnalytics(
  sessionName: string,
  range: AnalyticsRangeQuery,
): AnalyticsFetchState<{ points: AiUsagePoint[] }> {
  return useAnalyticsFetch(sessionName, range, fetchAiUsageAnalytics);
}

export function useMessagesAnalytics(
  sessionName: string,
  range: AnalyticsRangeQuery,
): AnalyticsFetchState<{ points: MessageFlowPoint[] }> {
  return useAnalyticsFetch(sessionName, range, fetchMessagesAnalytics);
}

export function useConversationsAnalytics(
  sessionName: string,
  range: AnalyticsRangeQuery,
): AnalyticsFetchState<{
  newConversations: NewConversationsPoint[];
  statusCounts: ConversationStatusCounts;
}> {
  return useAnalyticsFetch(sessionName, range, fetchConversationsAnalytics);
}

export function useEscalationRateAnalytics(
  sessionName: string,
  range: AnalyticsRangeQuery,
): AnalyticsFetchState<{ points: EscalationRatePoint[] }> {
  return useAnalyticsFetch(sessionName, range, fetchEscalationRateAnalytics);
}

/** Fase 1, Bloco F1.6 — expõe na UI a métrica `session-stability`, implementada ponta a ponta desde a M4D mas nunca antes consumida por nenhum hook/página. */
export function useSessionStabilityAnalytics(
  sessionName: string,
  range: AnalyticsRangeQuery,
): AnalyticsFetchState<{ points: SessionStabilityPoint[] }> {
  return useAnalyticsFetch(sessionName, range, fetchSessionStabilityAnalytics);
}

/**
 * Fase 1, Bloco F1.6 — funil do Pipeline (retrato atual, SEM faixa de
 * tempo): não usa `useAnalyticsFetch` (que sempre exige `range` na lista de
 * dependências do efeito) — só refaz a consulta quando `sessionName` muda.
 */
export function usePipelineFunnelAnalytics(
  sessionName: string,
): AnalyticsFetchState<{ funnel: PipelineFunnelCounts }> {
  const [data, setData] = useState<{ funnel: PipelineFunnelCounts } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setErrorMessage(null);
    fetchPipelineFunnelAnalytics(sessionName)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Falha ao carregar os dados de analytics.');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionName]);

  return { data, errorMessage };
}
