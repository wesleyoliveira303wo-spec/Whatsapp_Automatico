import { useCallback, useEffect, useState } from 'react';
import { fetchHistory } from '@/lib/clientApi';
import {
  formatDateTime,
  formatDisconnectReasonLabel,
  statusDotClassName,
  formatStatusLabel,
} from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import type { WhatsAppSessionEvent } from '@/lib/clientApi';

interface HistoryListProps {
  sessionName: string;
  limit?: number;
}

/**
 * Histórico recente de transições de status (M2, Fase 4 — UI-4), consumindo
 * `GET /api/sessions/:sessionName/history` (Fase 3, sobre M2-B5). Busca uma
 * vez por montagem (`useEffect` sem dependência de tempo) — deliberadamente
 * NÃO entra no SSE (`useSessionDetail`): histórico é uma consulta de
 * auditoria sob demanda, não um dado que precise de atualização em tempo
 * real a cada ~2s; o usuário pode recarregar a página se quiser o
 * histórico mais recente, mesmo padrão de qualquer tela de log/auditoria.
 * Funciona mesmo após a sessão ser removida (`removeSession`) — ver
 * docstring de `getSessionHistory()` em `apps/api`: o histórico sobrevive
 * deliberadamente à remoção.
 */
export default function HistoryList({ sessionName, limit = 20 }: HistoryListProps): JSX.Element {
  const [events, setEvents] = useState<WhatsAppSessionEvent[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Onda 1 do redesign (2026-08-22) — `onRetry` do `ErrorState` precisa de
  // uma ação real: como este componente já possui seu próprio fetch
  // autocontido (sem hook externo), bastou um contador que força o
  // `useEffect` a rodar de novo — mesmo padrão de `reloadToken` já usado em
  // `usePipelineConversations`/`useConversationsList`.
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setErrorMessage(null);
    fetchHistory(sessionName, limit)
      .then(({ events: fetched }) => {
        if (!cancelled) setEvents(fetched);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Falha ao carregar o histórico.');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionName, limit, retryToken]);

  const retry = useCallback(() => setRetryToken((token) => token + 1), []);

  if (errorMessage) {
    return <ErrorState description={errorMessage} onRetry={retry} className="p-4" />;
  }

  if (events === null) {
    return (
      <div className="flex flex-col gap-0">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>;
  }

  return (
    <ul className="flex flex-col">
      {events.map((event) => {
        const reason = formatDisconnectReasonLabel(event.disconnectReason);
        return (
          <li
            key={event.id}
            className="flex items-center gap-2.5 border-t border-border/70 py-2.5 first:border-t-0"
          >
            <span
              className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDotClassName(event.status))}
              aria-hidden="true"
            />
            <span className="flex-1 text-[12.5px] text-foreground-secondary">
              {formatStatusLabel(event.status)}
              {reason ? ` (${reason})` : ''}
            </span>
            <span className="shrink-0 text-[11.5px] text-muted-foreground">
              {formatDateTime(event.occurredAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
