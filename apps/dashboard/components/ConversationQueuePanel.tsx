import Link from 'next/link';
import { CheckCircle2, Clock, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { selectWaitingConversations, selectUnreadConversations } from '@/lib/conversationsView';
import { formatContactDisplayNameParts, formatShortRelativeTime } from '@/lib/formatters';
import ContactAvatar from './ContactAvatar';
import DisplayNameParts from './DisplayNameParts';
import type { ConversationSummary } from '@/lib/clientApi';

interface ConversationQueuePanelProps {
  sessionName: string;
  /** Lista JÁ carregada pela inbox — nenhuma requisição nova nasce aqui. */
  conversations: ConversationSummary[];
}

/** Quantos itens mostrar por seção — cabe sem rolagem na maioria das telas; o resto está a um clique na lista ao lado. */
const MAX_ITEMS_PER_SECTION = 6;

function QueueRow({
  conversation,
  sessionName,
  meta,
  metaTone,
}: {
  conversation: ConversationSummary;
  sessionName: string;
  meta: string;
  metaTone: 'warning' | 'primary';
}): JSX.Element {
  return (
    <Link
      href={`/sessions/${encodeURIComponent(sessionName)}/conversations/${encodeURIComponent(conversation.id)}`}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted"
    >
      <ContactAvatar
        sessionName={conversation.sessionName}
        contactJid={conversation.contactJid}
        contactName={conversation.contactName}
        savedContactName={conversation.savedContactName}
        className="h-8 w-8 shrink-0 text-[12px]"
        fetchLive={false}
      />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
        <DisplayNameParts
          {...formatContactDisplayNameParts(
            conversation.contactJid,
            conversation.contactName,
            conversation.savedContactName,
          )}
        />
      </span>
      <span
        className={cn(
          'shrink-0 text-[11.5px] font-semibold tabular-nums',
          metaTone === 'warning' ? 'text-warning-emphasis' : 'text-primary',
        )}
      >
        {meta}
      </span>
    </Link>
  );
}

function QueueSection({
  title,
  icon: Icon,
  iconTone,
  items,
  sessionName,
  metaFor,
  metaTone,
  emptyLabel,
}: {
  title: string;
  icon: typeof Clock;
  iconTone: 'warning' | 'primary';
  items: ConversationSummary[];
  sessionName: string;
  metaFor: (conversation: ConversationSummary) => string;
  metaTone: 'warning' | 'primary';
  emptyLabel: string;
}): JSX.Element {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 px-2.5">
        <Icon
          className={cn(
            'h-[13px] w-[13px]',
            iconTone === 'warning' ? 'text-warning' : 'text-primary',
          )}
          aria-hidden="true"
        />
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {items.length > 0 && (
          <span className="tabular-nums text-[12px] text-muted-foreground">{items.length}</span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-2.5 py-2 text-[13px] text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col">
          {items.map((conversation) => (
            <QueueRow
              key={conversation.id}
              conversation={conversation}
              sessionName={sessionName}
              meta={metaFor(conversation)}
              metaTone={metaTone}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Painel central da inbox de Conversas sem nenhuma conversa selecionada —
 * Onda 1 do redesign (2026-08-22).
 *
 * ANTES: um `EmptyState` genérico centralizado ("Selecione uma conversa"),
 * deixando ~60% da tela em branco mesmo numa sessão com trabalho pendente —
 * um dos seis defeitos concretos que a auditoria apontou como a causa real
 * da sensação de "produto gerado por IA" (vazio estrutural, não a paleta).
 *
 * AGORA: a fila do dia — aguardando atendente (mais urgente primeiro) e não
 * lidas (mais recente primeiro) — derivada do MESMO array que a lista já
 * carregou (`selectWaitingConversations`/`selectUnreadConversations`, puras,
 * `lib/conversationsView.ts`). Zero requisição nova, zero dado inventado:
 * mesma disciplina de `pages/index.tsx` ("mostrar [indicador] sem dado real
 * seria inventar dado, não indicador").
 *
 * Quando as duas filas estão vazias, mostra um estado positivo ("Tudo em
 * dia") em vez do convite genérico — reconhece que zero pendências é um bom
 * momento, não a ausência de um.
 */
export default function ConversationQueuePanel({
  sessionName,
  conversations,
}: ConversationQueuePanelProps): JSX.Element {
  const waiting = selectWaitingConversations(conversations, MAX_ITEMS_PER_SECTION);
  const unread = selectUnreadConversations(conversations, MAX_ITEMS_PER_SECTION);
  const allCaughtUp = waiting.length === 0 && unread.length === 0;

  if (allCaughtUp) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-success/[.12]">
          <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-foreground">Tudo em dia</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Nenhuma conversa aguardando atendente ou com mensagem não lida.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fx-scroll h-full overflow-y-auto p-5">
      <div className="mx-auto flex w-full max-w-[440px] flex-col gap-5">
        <div>
          <div className="mb-0.5 flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-[14px] font-semibold text-foreground">Fila do dia</h2>
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            Escolha uma conversa na lista ao lado, ou comece por aqui.
          </p>
        </div>

        <QueueSection
          title="Aguardando atendente"
          icon={Clock}
          iconTone="warning"
          items={waiting}
          sessionName={sessionName}
          metaFor={(conversation) => `há ${formatShortRelativeTime(conversation.escalatedAt)}`}
          metaTone="warning"
          emptyLabel="Nenhuma conversa aguardando atendente."
        />

        <QueueSection
          title="Não lidas"
          icon={Inbox}
          iconTone="primary"
          items={unread}
          sessionName={sessionName}
          metaFor={(conversation) => String(conversation.unreadCount)}
          metaTone="primary"
          emptyLabel="Nenhuma conversa com mensagem não lida."
        />
      </div>
    </div>
  );
}
