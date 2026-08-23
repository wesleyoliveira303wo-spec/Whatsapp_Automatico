import Link from 'next/link';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import {
  formatConversationTimestamp,
  formatContactDisplayNameParts,
  formatConversationStatusLabel,
  formatConversationStageLabel,
} from '@/lib/formatters';
import ContactAvatar from './ContactAvatar';
import DisplayNameParts from './DisplayNameParts';
import TagChip from './TagChip';
import type { ConversationSummary } from '@/lib/clientApi';

/** Redesign 2026-08-05 (R4) — teto de chips exibidos na linha da lista, antes de resumir em "+N" (espaço é escasso numa linha compacta de inbox). */
const MAX_LIST_TAGS = 3;

interface ConversationListItemProps {
  conversation: ConversationSummary;
  /** Milestone 6, Bloco M6H-2 — destaca a linha da conversa aberta no painel ao lado (padrão WhatsApp/Telegram: lista + chat lado a lado). */
  active?: boolean;
  /**
   * Fase 1 (2026-08-07) — Botão POWER da sessão. `false` sobrepõe o selo
   * "Bot"/"Humano" por "IA desativada" (vermelho), em TODA linha da lista,
   * sem exceção — decisão explícita do fundador. Default `true`.
   */
  aiEnabled?: boolean;
}

/**
 * Uma linha da lista de conversas — Milestone 3, Bloco 6, redesenhada na
 * Milestone 6, Bloco M6H-2 (ADR #76) como linha compacta de inbox, e
 * novamente no reskin 2026-08-06 (Design System, tela Conversas) para bater
 * pixel a pixel com o mockup: linha vira um "card" arredondado (12px, sem
 * `border-b` entre itens — hierarquia por espaço, não por borda), com um
 * indicador verde na borda esquerda quando selecionada e um rótulo "Bot"/
 * "Humano" ao lado do nome (derivado de `status`, já existia como dado).
 *
 * `/sessions/:sessionName/conversations/:id` usa `conversation.sessionName`,
 * que já vem no DTO — funciona mesmo antes/depois do filtro server-side
 * (M6H-2), já que cada linha sempre sabe a própria sessão.
 */
function ConversationListItem({
  conversation,
  active = false,
  aiEnabled = true,
}: ConversationListItemProps): JSX.Element {
  // Reforma do escalonamento (2026-07-25): "aguardando atendente" = a IA
  // pediu atenção humana (`escalatedAt` definido) — a conversa pode continuar
  // em `status: 'bot'` nesse caso, a IA segue respondendo até alguém assumir.
  const waitingForHuman = Boolean(conversation.escalatedAt);

  return (
    <Link
      href={`/sessions/${encodeURIComponent(conversation.sessionName)}/conversations/${encodeURIComponent(conversation.id)}`}
      className={cn(
        'relative flex gap-[11px] rounded-lg py-[11px] pl-3 pr-[11px] transition-colors',
        active
          ? 'bg-muted'
          : waitingForHuman
            ? 'bg-warning/5 hover:bg-warning/10'
            : 'hover:bg-muted',
      )}
    >
      {active && (
        <span
          className="absolute left-[3px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary"
          aria-hidden="true"
        />
      )}
      <ContactAvatar
        sessionName={conversation.sessionName}
        contactJid={conversation.contactJid}
        contactName={conversation.contactName}
        savedContactName={conversation.savedContactName}
        waitingForHuman={waitingForHuman}
        className="h-[38px] w-[38px] text-[13px]"
        // CORREÇÃO 2026-08-18: a lista tem uma linha por conversa — buscar
        // foto ao vivo para cada uma martelava o socket do Baileys sem
        // parar (achado real de produção, contribuiu para falhas de envio).
        // Só iniciais aqui; a foto de verdade continua no cabeçalho da
        // conversa aberta (`ConversationContextPanel`), onde é só 1 contato.
        fetchLive={false}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-tight text-foreground">
            <DisplayNameParts
              {...formatContactDisplayNameParts(
                conversation.contactJid,
                conversation.contactName,
                conversation.savedContactName,
              )}
            />
          </p>
          <span
            className={cn(
              'shrink-0 text-[10.5px] font-semibold',
              !aiEnabled
                ? 'text-destructive'
                : conversation.status === 'human'
                  ? 'text-warning-emphasis'
                  : 'text-success-emphasis',
            )}
          >
            {!aiEnabled ? 'IA desativada' : conversation.status === 'human' ? 'Humano' : 'Bot'}
          </span>
          <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
            {formatConversationTimestamp(conversation.lastMessageAt ?? conversation.createdAt)}
          </span>
        </div>
        <div className="mt-[3px] flex items-center gap-2">
          {/* Reskin 2026-08-06 (Design System, tela Conversas) — a prévia SEMPRE
              mostra a última mensagem real (ou o rótulo de status na ausência
              dela), mesmo numa conversa aguardando atendente: o mockup nunca
              sobrepõe esse texto, o sinal de escalonamento já é comunicado
              pelo ponto no avatar + pelo selo abaixo. */}
          <p className="min-w-0 flex-1 truncate text-[12.5px] leading-[1.35] text-muted-foreground">
            {conversation.lastMessagePreview || formatConversationStatusLabel(conversation.status)}
          </p>
          {conversation.unreadCount > 0 && (
            <span
              className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground"
              title={`${conversation.unreadCount} mensagem(ns) não lida(s)`}
            >
              {conversation.unreadCount}
            </span>
          )}
        </div>
        <div className="mt-[7px] flex flex-nowrap items-center gap-[5px] overflow-hidden">
          {/* Selos de Pipeline — só um é exibido por vez:
              - "Aguardando atendente" (reforma do escalonamento): a IA pediu ajuda humana.
              - "Não cliente" (ADR #96): conversa excluída do funil comercial.
              - Estágio atual (ADR #84): estágio do funil quando dentro do pipeline.
                "Novo" (default) é omitido — não agrega informação, toda conversa
                começa aí. Os terminais "Fechado"/"Perdido" recebem cores distintas
                para reconhecimento imediato. */}
          {waitingForHuman ? (
            <span className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-warning/[.13] px-[7px] text-[11px] font-semibold text-warning-emphasis">
              <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-current opacity-85" />
              Aguardando atendente
            </span>
          ) : conversation.excludedFromPipeline ? (
            <span
              className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-muted-foreground/40 px-[7px] text-[11px] font-medium text-muted-foreground"
              title="Marcada como Não cliente no Pipeline — a IA não responde aqui."
            >
              <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-current opacity-85" />
              Não cliente
            </span>
          ) : conversation.stage !== 'new' ? (
            <span
              className={cn(
                'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-[7px] text-[11px] font-semibold',
                conversation.stage === 'contacted' && 'bg-muted text-muted-foreground',
                conversation.stage === 'negotiating' && 'bg-warning/[.12] text-warning-emphasis',
                conversation.stage === 'closed_won' && 'bg-success/[.12] text-success-emphasis',
                conversation.stage === 'closed_lost' &&
                  'bg-destructive/10 text-destructive-emphasis',
              )}
              title={`Estágio no Pipeline: ${formatConversationStageLabel(conversation.stage)}`}
            >
              <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-current opacity-85" />
              {formatConversationStageLabel(conversation.stage)}
            </span>
          ) : null}
          {conversation.tags.slice(0, MAX_LIST_TAGS).map((tag) => (
            <TagChip
              key={tag.id}
              name={tag.name}
              color={tag.color}
              className="h-5 shrink-0 px-[7px] text-[11px] font-medium"
            />
          ))}
          {conversation.tags.length > MAX_LIST_TAGS && (
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
              +{conversation.tags.length - MAX_LIST_TAGS}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * PERFORMANCE (auditoria 2026-08-22) — esta é a linha mais cara do produto em
 * volume: a lista de Conversas vive de um poll SSE de ~2s
 * (`SSE_POLL_INTERVAL_MS`), e cada frame produz um array novo, então TODA a
 * lista era reconciliada 30x por minuto, indefinidamente, enquanto a aba
 * estivesse aberta. Medido na sessão real de 58 conversas: 31,8 KB por frame
 * e 58 linhas reconstruídas a cada 2s, cada uma montando `ContactAvatar`,
 * até 3 `TagChip` e vários `formatters`.
 *
 * Comparador padrão é suficiente e correto: as três props são
 * `conversation` (objeto novo só quando aquela conversa muda de fato —
 * `mergeConversationPages` preserva a identidade dos itens inalterados) e
 * dois booleanos.
 */
export default memo(ConversationListItem);
