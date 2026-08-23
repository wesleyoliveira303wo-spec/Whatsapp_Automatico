import { ChevronDown } from 'lucide-react';
import ContactAvatar from './ContactAvatar';
import ConversationStatusBadge from './ConversationStatusBadge';
import AiInteractionPanel from './AiInteractionPanel';
import ConversationTagPicker from './ConversationTagPicker';
import ConversationSummarySection from './ConversationSummarySection';
import SaveContactButton from './SaveContactButton';
import DisplayNameParts from './DisplayNameParts';
import { Skeleton } from '@/components/ui/skeleton';
import { useConversationDetail } from '@/hooks/useConversationDetail';
import { useAiInteractions } from '@/hooks/useAiInteractions';
import {
  formatContactDisplayNameParts,
  formatPhoneNumber,
  formatClientSince,
  formatConversationStageLabel,
} from '@/lib/formatters';

interface ConversationContextPanelProps {
  sessionName: string;
  conversationId: string;
  /** Fase 1 (2026-08-07) — Botão POWER da sessão, repassado ao `ConversationStatusBadge`. Default `true`. */
  aiEnabled?: boolean;
}

const RECENT_INTERACTIONS_LIMIT = 5;

/**
 * Redesign 2026-08-05 (R3) — 3ª coluna da tela de Conversas: contexto do
 * contato ao lado do chat (avatar, telefone, tempo de relacionamento, chips
 * de estágio/aguardando, e as interações de IA mais recentes — o `<details>`
 * "Interações de IA" que antes vivia no rodapé de `ConversationDetailPanel`
 * migrou para cá).
 *
 * Busca os próprios dados via `useConversationDetail`/`useAiInteractions` —
 * SEM lifting de estado — mesmo padrão já aceito no projeto de um hook ser
 * montado em mais de um lugar (`useSessionDetail` já é chamado
 * independentemente por `SessionRail` E `SessionConnectionPanel`). Evita um
 * refactor arriscado de `ConversationDetailPanel` (que tem lógica delicada
 * de scroll) só para compartilhar estado — o custo é 2 pollings de 4s a mais
 * por conversa aberta, aceitável.
 *
 * Só aparece em telas largas (`xl:`, 1280px+) — em `lg` o espaço já está
 * dividido entre lista e chat.
 */
export default function ConversationContextPanel({
  sessionName,
  conversationId,
  aiEnabled = true,
}: ConversationContextPanelProps): JSX.Element {
  const { conversation, loading, applyUpdate } = useConversationDetail(conversationId);
  const {
    interactions,
    errorMessage: interactionsError,
    refresh: refreshInteractions,
  } = useAiInteractions(conversationId, RECENT_INTERACTIONS_LIMIT);

  if (loading || !conversation) {
    return (
      <aside className="hidden w-80 shrink-0 flex-col gap-4 border-l border-border bg-panel p-5 xl:flex">
        <Skeleton className="mx-auto h-[68px] w-[68px] rounded-full" />
        <Skeleton className="mx-auto h-4 w-32 rounded" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </aside>
    );
  }

  return (
    <aside className="fx-scroll hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-panel xl:flex">
      <div className="flex flex-col items-center border-b border-border px-5 pb-5 pt-[26px] text-center">
        <ContactAvatar
          sessionName={sessionName}
          contactJid={conversation.contactJid}
          contactName={conversation.contactName}
          savedContactName={conversation.savedContactName}
          className="mb-3 h-[68px] w-[68px] text-[21px]"
        />
        <p className="text-[15.5px] font-semibold tracking-tight text-foreground">
          <DisplayNameParts
            {...formatContactDisplayNameParts(
              conversation.contactJid,
              conversation.contactName,
              conversation.savedContactName,
            )}
          />
        </p>
        <p className="mt-[3px] flex items-center justify-center gap-1.5 text-[12.5px] tabular-nums text-muted-foreground">
          {formatPhoneNumber(conversation.contactJid)}
          <SaveContactButton conversation={conversation} onUpdated={applyUpdate} />
        </p>

        <div className="mt-[13px] flex flex-wrap items-center justify-center gap-[5px]">
          <ConversationStatusBadge
            status={conversation.status}
            escalatedAt={conversation.escalatedAt}
            aiEnabled={aiEnabled}
          />
          {conversation.excludedFromPipeline ? (
            <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-md border border-dashed border-muted-foreground/40 px-2 text-[11.5px] font-medium text-muted-foreground">
              Não cliente
            </span>
          ) : (
            conversation.stage !== 'new' && (
              <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-md bg-muted px-2 text-[11.5px] font-medium text-muted-foreground">
                {formatConversationStageLabel(conversation.stage)}
              </span>
            )
          )}
          <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-md bg-muted px-2 text-[11.5px] font-medium text-muted-foreground">
            Cliente há {formatClientSince(conversation.createdAt)}
          </span>
        </div>
      </div>

      <div className="border-b border-border px-5 py-4">
        <ConversationTagPicker
          sessionName={sessionName}
          conversationId={conversationId}
          tags={conversation.tags}
          onChange={(tags) => applyUpdate({ ...conversation, tags })}
        />
      </div>

      <div className="border-b border-border px-5 py-4">
        <ConversationSummarySection conversation={conversation} onUpdated={applyUpdate} />
      </div>

      <details className="group px-5 pb-6 pt-4" open>
        <summary className="flex cursor-pointer list-none items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Últimas interações
          </span>
          <ChevronDown
            className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="mt-2.5">
          <AiInteractionPanel
            interactions={interactions}
            errorMessage={interactionsError}
            onRetry={refreshInteractions}
          />
        </div>
      </details>
    </aside>
  );
}
