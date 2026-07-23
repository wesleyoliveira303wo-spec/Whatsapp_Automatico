import Link from 'next/link';
import StatusBadge from './StatusBadge';
import { formatDateTime } from '@/lib/formatters';
import type { WhatsAppSessionSummary } from '@/lib/clientApi';

interface SessionListItemProps {
  session: WhatsAppSessionSummary;
}

/** Uma linha da lista de sessões (M2, Fase 4 — UI-1). Leva ao detalhe (`/sessions/:sessionName`) — todas as ações (conectar/desconectar/remover/QR Code) vivem só lá, mantendo a lista somente-leitura e simples. */
export default function SessionListItem({ session }: SessionListItemProps): JSX.Element {
  return (
    <Link
      href={`/sessions/${encodeURIComponent(session.sessionName)}`}
      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-400 hover:shadow"
    >
      <div>
        <p className="font-semibold text-gray-800">{session.sessionName}</p>
        <p className="text-sm text-gray-500">{session.phoneNumber ?? 'Número ainda não vinculado'}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right text-sm text-gray-500">
          <p>Última atividade</p>
          <p>{formatDateTime(session.lastSeen)}</p>
        </div>
        <StatusBadge status={session.status} />
      </div>
    </Link>
  );
}
