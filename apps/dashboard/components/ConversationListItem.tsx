import Link from 'next/link';
import ConversationStatusBadge from './ConversationStatusBadge';
import { formatDateTime, formatContactJid } from '@/lib/formatters';
import type { ConversationSummary } from '@/lib/clientApi';

interface ConversationListItemProps {
  conversation: ConversationSummary;
}

/**
 * Uma linha da lista de conversas (Milestone 3, Bloco 6). Leva ao detalhe
 * (`/conversations/:id`) — todas as acoes (escalar/retomar) vivem so la,
 * mantendo a lista somente-leitura e simples (mesmo padrao de
 * `SessionListItem`, M2).
 */
export default function ConversationListItem({ conversation }: ConversationListItemProps): JSX.Element {
  // Feature N2: "aguardando atendente" = escalada para humano e ainda sem dono.
  // Destaque visual (borda/fundo âmbar + selo) para saltar aos olhos na fila.
  const waitingForHuman = conversation.status === 'human' && !conversation.assignedToUserId;

  return (
    <Link
      href={`/conversations/${encodeURIComponent(conversation.id)}`}
      className={`flex items-center justify-between rounded-lg border p-4 shadow-sm transition hover:shadow ${
        waitingForHuman
          ? 'border-l-4 border-amber-400 bg-amber-50 hover:border-amber-500'
          : 'border-gray-200 bg-white hover:border-primary'
      }`}
    >
      <div>
        <p className="font-semibold text-gray-800">{formatContactJid(conversation.contactJid)}</p>
        <p className="text-sm text-gray-500">Sessao: {conversation.sessionName}</p>
      </div>
      <div className="flex items-center gap-4">
        {waitingForHuman && (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">Aguardando atendente</span>
        )}
        <div className="text-right text-sm text-gray-500">
          <p>Ultima atualizacao</p>
          <p>{formatDateTime(conversation.updatedAt)}</p>
        </div>
        <ConversationStatusBadge status={conversation.status} />
      </div>
    </Link>
  );
}
