import { useEventSource } from './useEventSource';
import type { WhatsAppSessionDetail } from '../lib/clientApi';

/** Ver `SessionsStreamFrame` em `useSessionsList.ts` — mesmo envelope `{ status, body }` que `runSsePoller` grava em cada frame `data:`, aqui para `pages/api/sessions/[sessionName]/stream.ts`. */
interface SessionDetailStreamFrame {
  status: number;
  body: WhatsAppSessionDetail;
}

export interface UseSessionDetailResult {
  session: WhatsAppSessionDetail | null;
  loading: boolean;
  errorMessage: string | null;
  connected: boolean;
}

/**
 * Detalhe de uma sessão (M2, Fase 4 — UI-2 + UI-3), mantido vivo via
 * `GET /api/sessions/:sessionName/stream` (Fase 3) — inclui `generation`,
 * ausente na lista (ver docstring de `WhatsAppSessionDetails` em
 * `apps/api`). `sessionName === null` desliga o hook (ver
 * `useEventSource`) — usado enquanto o router do Next ainda não hidratou
 * `router.query.sessionName` na primeira renderização client-side.
 */
export function useSessionDetail(sessionName: string | null): UseSessionDetailResult {
  const url = sessionName ? `/api/sessions/${encodeURIComponent(sessionName)}/stream` : null;
  const {
    data,
    errorMessage: transientErrorMessage,
    connected,
  } = useEventSource<SessionDetailStreamFrame>(url);

  const session = data && data.status === 200 ? data.body : null;
  const errorMessage =
    data && data.status !== 200
      ? `Falha ao carregar sessão (status ${data.status}).`
      : transientErrorMessage;

  return { session, loading: data === null, errorMessage, connected };
}
