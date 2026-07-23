import { useMemo } from 'react';
import { useEventSource } from './useEventSource';
import type { WhatsAppSessionSummary } from '../lib/clientApi';

interface SessionsListBody {
  sessions: WhatsAppSessionSummary[];
}

/**
 * Shape exato de cada frame `data:` emitido por `pages/api/sessions/stream.ts`
 * (Fase 3, BFF-3): `{ status, body }`, NÃO `body` diretamente — o poller
 * (`runSsePoller`) encapsula o `ApiResponse<T>` de `callApi()` inteiro,
 * porque a conexão SSE em si é sempre um único `200` de longa duração; o
 * status HTTP de CADA chamada individual a `apps/api` só pode viajar dentro
 * do próprio frame. Esquecer esse envelope (lendo `data.sessions` em vez de
 * `data.body.sessions`) foi um bug pego em auto-revisão antes da entrega —
 * ver auto-auditoria.
 */
interface SessionsStreamFrame {
  status: number;
  body: SessionsListBody;
}

export interface UseSessionsListResult {
  sessions: WhatsAppSessionSummary[];
  /** `true` até o primeiro frame SSE chegar — distinto de `sessions.length === 0` (tenant sem sessões, um estado válido e diferente de "ainda carregando"). */
  loading: boolean;
  errorMessage: string | null;
  connected: boolean;
}

/** Lista de sessões do tenant (M2, Fase 4 — UI-1 + UI-3), mantida viva via `GET /api/sessions/stream` (Fase 3). Substitui um `fetch` único + polling manual: o SSE já poll a cada ~2s do lado do BFF (`SSE_POLL_INTERVAL_MS`). */
export function useSessionsList(): UseSessionsListResult {
  const { data, errorMessage: transientErrorMessage, connected } = useEventSource<SessionsStreamFrame>('/api/sessions/stream');

  const sessions = useMemo(() => {
    if (!data || data.status !== 200) return [];
    return data.body.sessions;
  }, [data]);

  const errorMessage = data && data.status !== 200 ? `Falha ao carregar sessões (status ${data.status}).` : transientErrorMessage;

  return { sessions, loading: data === null, errorMessage, connected };
}
