import Link from 'next/link';
import { memo, type DragEvent } from 'react';
import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatContactDisplayNameParts,
  formatElapsedDays,
  formatPipelineColumnLabel,
  PIPELINE_COLUMN_ORDER,
  NOT_CLIENT_COLUMN,
  type PipelineColumnKey,
} from '@/lib/formatters';
import ContactAvatar from './ContactAvatar';
import DisplayNameParts from './DisplayNameParts';
import TagChip from './TagChip';
import type { ConversationSummary } from '@/lib/clientApi';

interface PipelineCardProps {
  conversation: ConversationSummary;
  /** Arrasto nativo HTML5 (sem dependência nova — ver docstring de `PipelineBoard`). */
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: (event: DragEvent<HTMLDivElement>) => void;
  dragging?: boolean;
  /**
   * Alternativa por teclado/clique ao arrasto (achado de auditoria de
   * acessibilidade 2026-08-22 — Web Interface Guidelines: gestos precisam
   * de alternativa por toque/clique e teclado). Um `<select>` nativo é
   * sempre operável por teclado (setas + Enter) e por leitor de tela, sem
   * exigir nenhuma biblioteca nova.
   */
  onMoveToColumn: (column: PipelineColumnKey) => void;
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
function PipelineCard({
  conversation,
  onDragStart,
  onDragEnd,
  dragging = false,
  onMoveToColumn,
}: PipelineCardProps): JSX.Element {
  const classificadoPorHumano = conversation.stageSetBy === 'human';
  const currentColumn: PipelineColumnKey = conversation.excludedFromPipeline
    ? NOT_CLIENT_COLUMN
    : conversation.stage;

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
          savedContactName={conversation.savedContactName}
          className="h-7 w-7 text-[11px]"
          // CORREÇÃO 2026-08-18: mesmo motivo de `ConversationListItem` — o
          // board pode ter muitos cards simultâneos, cada um buscando foto ao
          // vivo martelava o socket do Baileys sem parar.
          fetchLive={false}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
          <DisplayNameParts
            {...formatContactDisplayNameParts(
              conversation.contactJid,
              conversation.contactName,
              conversation.savedContactName,
            )}
          />
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

      <div className="mt-[9px] flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {conversation.excludedFromPipeline
            ? 'IA desligada'
            : `${formatElapsedDays(conversation.stageUpdatedAt)} neste estágio`}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <select
            aria-label="Mover conversa para outro estágio do Pipeline"
            title="Mover para outro estágio"
            value=""
            onChange={(event) => {
              const target = event.target.value as PipelineColumnKey | '';
              event.target.value = '';
              if (target) onMoveToColumn(target);
            }}
            className="rounded-md border border-border bg-transparent px-1 py-0.5 text-[10.5px] text-muted-foreground outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <option value="" disabled>
              Mover…
            </option>
            {PIPELINE_COLUMN_ORDER.filter((column) => column !== currentColumn).map((column) => (
              <option key={column} value={column}>
                {formatPipelineColumnLabel(column)}
              </option>
            ))}
          </select>
          <Link
            href={`/sessions/${encodeURIComponent(conversation.sessionName)}/conversations/${encodeURIComponent(conversation.id)}`}
            className="text-[11px] font-semibold text-primary hover:text-primary/80"
          >
            Ver conversa <span aria-hidden="true">›</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * PERFORMANCE (auditoria 2026-08-22) — o board reagrupa e re-renderiza a cada
 * `dragEnter` durante o arrasto, e cada card monta um `ContactAvatar`, N
 * `TagChip` e um `<select>` com uma `<option>` por coluna. Sem memo, arrastar
 * um card reconciliava TODOS os cards do quadro várias vezes por segundo.
 *
 * O comparador ignora deliberadamente as três props de callback: as closures
 * são recriadas a cada render de `PipelineColumn` (são geradas dentro de um
 * `.map`), mas TODAS delegam para o mesmo `moveConversation`/`setDraggedId`
 * estáveis do `PipelineBoard`, que leem o estado atual por `ref` — nunca por
 * closure. Ou seja, uma closure "velha" é funcionalmente idêntica à nova, e
 * compará-las por referência só produziria falso negativo.
 *
 * `conversation` é comparado por REFERÊNCIA de propósito: o hook cria um
 * objeto novo exatamente quando aquela conversa muda (`applyLocalUpdate` faz
 * `map` preservando os itens intactos), então a identidade já é o sinal certo
 * — comparação profunda seria custo sem ganho.
 */
export default memo(
  PipelineCard,
  (prev, next) => prev.conversation === next.conversation && prev.dragging === next.dragging,
);
