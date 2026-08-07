import Link from 'next/link';
import type { DragEvent } from 'react';
import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatContactDisplayName, formatElapsedDays } from '@/lib/formatters';
import ContactAvatar from './ContactAvatar';
import TagChip from './TagChip';
import type { ConversationSummary } from '@/lib/clientApi';

interface PipelineCardProps {
  conversation: ConversationSummary;
  /** Arrasto nativo HTML5 (sem dependência nova — ver docstring de `PipelineBoard`). */
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: (event: DragEvent<HTMLDivElement>) => void;
  dragging?: boolean;
}

/**
 * Um card do board Kanban (Pipeline de CRM, Milestone 6, Bloco M6H-5).
 * Reaproveita `ContactAvatar`/`formatContactDisplayName` já usados em
 * `ConversationListItem` — mesma identidade visual do contato em toda a
 * Dashboard.
 *
 * O ícone Bot/User (linha do nome) indica quem classificou o card por
 * último — informação pura, SEM consequência de comportamento. Desde a ADR
 * #89 a IA reclassifica toda conversa a cada resposta, inclusive as já
 * corrigidas à mão; ela só nunca move um card para trás no funil. Uma
 * versão anterior deste componente (ADR #87) exibia um aviso de "conversa
 * travada" e um botão "Devolver à IA" — os dois deixaram de existir junto
 * com a própria trava.
 *
 * Reskin 2026-08-07 (Design System, tela Pipeline) — reestruturado em 3
 * linhas pixel a pixel com `Francis Pipeline.dc.html`: (1) avatar 28px +
 * nome + ícone classificador (SEMPRE visível, inclusive em "Não cliente" —
 * o mockup nunca troca esse ícone por "IA desligada", só o card #9 da
 * amostra prova isso: `byHuman:true` num card em `stage:"excluded"`); (2)
 * tags da conversa (chip compacto, ausente na versão anterior deste card);
 * (3) tempo no estágio (ou "IA desligada" em "Não cliente") + link "Ver
 * conversa". A antiga linha extra de timestamp (`formatConversationTimestamp`)
 * saiu — o mockup não a tem. Sem sombra (Design System: cards são
 * fundo+borda, nunca `shadow`).
 */
export default function PipelineCard({
  conversation,
  onDragStart,
  onDragEnd,
  dragging = false,
}: PipelineCardProps): JSX.Element {
  const classificadoPorHumano = conversation.stageSetBy === 'human';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'cursor-grab rounded-lg border border-border bg-card px-3 py-[11px] transition-colors active:cursor-grabbing',
        'hover:border-foreground/20',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-[9px]">
        <ContactAvatar
          sessionName={conversation.sessionName}
          contactJid={conversation.contactJid}
          contactName={conversation.contactName}
          className="h-7 w-7 text-[11px]"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
          {formatContactDisplayName(conversation.contactJid, conversation.contactName)}
        </span>
        <span
          className="shrink-0 text-muted-foreground"
          title={classificadoPorHumano ? 'Classificado por humano' : 'Classificado pela IA'}
        >
          {classificadoPorHumano ? (
            <User className="h-[13px] w-[13px]" aria-hidden="true" />
          ) : (
            <Bot className="h-[13px] w-[13px]" aria-hidden="true" />
          )}
        </span>
      </div>

      {conversation.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {conversation.tags.map((tag) => (
            <TagChip
              key={tag.id}
              name={tag.name}
              color={tag.color}
              className="h-[19px] px-1.5 text-[10.5px] font-medium"
            />
          ))}
        </div>
      )}

      <div className="mt-[9px] flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {conversation.excludedFromPipeline
            ? 'IA desligada'
            : `${formatElapsedDays(conversation.stageUpdatedAt)} neste estágio`}
        </span>
        <Link
          href={`/sessions/${encodeURIComponent(conversation.sessionName)}/conversations/${encodeURIComponent(conversation.id)}`}
          className="text-[11px] font-semibold text-primary hover:text-primary/80"
        >
          Ver conversa <span aria-hidden="true">›</span>
        </Link>
      </div>
    </div>
  );
}
