import { useEffect, useState } from 'react';
import StatusBadge from './StatusBadge';
import { fetchHistory } from '@/lib/clientApi';
import { formatDateTime, formatDisconnectReasonLabel } from '@/lib/formatters';
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

  useEffect(() => {
    let cancelled = false;
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
  }, [sessionName, limit]);

  if (errorMessage) {
    return <p className="text-sm text-red-600">{errorMessage}</p>;
  }

  if (events === null) {
    return <p className="text-sm text-gray-500">Carregando histórico…</p>;
  }

  if (events.length === 0) {
    return <p className="text-sm text-gray-500">Nenhum evento registrado ainda.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <li key={event.id} className="flex items-center justify-between rounded-md border border-gray-100 bg-white px-3 py-2 text-sm">
          <div className="flex items-center gap-3">
            <StatusBadge status={event.status} />
            {formatDisconnectReasonLabel(event.disconnectReason) && (
              <span className="text-gray-500">{formatDisconnectReasonLabel(event.disconnectReason)}</span>
            )}
          </div>
          <span className="text-gray-400">{formatDateTime(event.occurredAt)}</span>
        </li>
      ))}
    </ul>
  );
}
