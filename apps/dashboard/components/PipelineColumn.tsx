import { memo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  formatPipelineColumnLabel,
  pipelineColumnDotClassName,
  NOT_CLIENT_COLUMN,
  type PipelineColumnKey,
} from '@/lib/formatters';
import PipelineCard from './PipelineCard';
import type { ConversationSummary } from '@/lib/clientApi';

interface PipelineColumnProps {
  column: PipelineColumnKey;
  conversations: ConversationSummary[];
  draggedId: string | null;
  onDragStart: (conversationId: string) => void;
  onDragEnd: () => void;
  onDropOnColumn: (column: PipelineColumnKey) => void;
  dragOver: boolean;
  onDragEnterColumn: (column: PipelineColumnKey) => void;
  /** Alternativa por teclado/clique ao arrastar-e-soltar (achado de auditoria de acessibilidade 2026-08-22) — repassada de `PipelineBoard` até o `<select>` de cada `PipelineCard`. */
  onMoveCard: (conversationId: string, column: PipelineColumnKey) => void;
}

/**
 * Uma coluna do board Kanban (Pipeline de CRM, Milestone 6, Bloco M6H-5) —
 * cabeçalho com ponto colorido + rótulo + contagem, corpo com os cards
 * (`groupConversationsByPipelineColumn` já entrega ordenados por
 * `stageUpdatedAt` DESC). `dragOver` realça a coluna-alvo enquanto um card é
 * arrastado por cima — feedback visual mínimo do drag-and-drop nativo (sem
 * biblioteca).
 *
 * ADR #96 (2026-08-01): a coluna passou a ser uma `PipelineColumnKey`, não um
 * `ConversationStage` — "Não cliente" é uma coluna derivada de
 * `excludedFromPipeline`, não um estágio do funil.
 *
 * Reskin 2026-08-07 (Design System, tela Pipeline) — largura fixa 268px
 * (era 288px), fundo `bg-panel`/borda sólida para colunas do funil, fundo
 * transparente/borda tracejada só para "Não cliente" (`Francis
 * Pipeline.dc.html` linha 84). O subtítulo "A IA não responde nesta
 * coluna" SAIU — o mockup não tem aviso no cabeçalho da coluna, só no
 * próprio card (`PipelineCard` já mostra "IA desligada" no lugar do tempo no
 * estágio) — informação preservada, só sem duplicar no nível da coluna.
 * Classe `pipeline-column` (não-Tailwind) é um hook estável para os testes
 * localizarem a coluna independente do valor exato de largura/raio.
 */
function PipelineColumn({
  column,
  conversations,
  draggedId,
  onDragStart,
  onDragEnd,
  onDropOnColumn,
  dragOver,
  onDragEnterColumn,
  onMoveCard,
}: PipelineColumnProps): JSX.Element {
  const isNotClientColumn = column === NOT_CLIENT_COLUMN;

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        onDragEnterColumn(column);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropOnColumn(column);
      }}
      className={cn(
        'pipeline-column flex w-[268px] shrink-0 flex-col rounded-lg border border-border bg-panel transition-colors',
        isNotClientColumn && 'border-dashed bg-transparent',
        dragOver && 'border-primary bg-primary/5',
      )}
    >
      <div className="flex shrink-0 items-center gap-2 px-[13px] pb-[10px] pt-[13px]">
        <span
          className={cn(
            'h-[7px] w-[7px] shrink-0 rounded-full',
            pipelineColumnDotClassName(column),
          )}
          aria-hidden="true"
        />
        <h3 className="flex-1 text-[13px] font-semibold tracking-tight text-foreground">
          {formatPipelineColumnLabel(column)}
        </h3>
        <span className="rounded-full bg-foreground/[.04] px-[7px] py-px text-[11.5px] font-semibold text-muted-foreground">
          {conversations.length}
        </span>
      </div>
      {/*
        Onda 2 do redesign (2026-08-23) — o board nunca teve NENHUM feedback
        de movimento: soltar um card fazia ele "saltar" instantaneamente para
        a posição nova, sem transição alguma (achado direto do pedido do
        fundador — "anime minha ferramenta"). `AnimatePresence
        mode="popLayout"` é o modo do framer-motion feito para listas: tira o
        card que está SAINDO do fluxo normal (`position: absolute` durante a
        saída) para os irmãos já reflowarem suavemente por baixo, em vez do
        salto brusco que `mode="sync"` (o padrão) causaria. Ver `PipelineCard`
        para o `layout`/`initial`/`animate`/`exit` de cada card.
      */}
      <div
        className="fx-scroll flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2"
        style={{ minHeight: '4rem' }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {conversations.map((conversation) => (
            <PipelineCard
              key={conversation.id}
              conversation={conversation}
              dragging={draggedId === conversation.id}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                onDragStart(conversation.id);
              }}
              onDragEnd={onDragEnd}
              onMoveToColumn={(targetColumn) => onMoveCard(conversation.id, targetColumn)}
            />
          ))}
        </AnimatePresence>
        {conversations.length === 0 && (
          <p className="px-2.5 py-5 text-center text-xs text-muted-foreground">Nenhum card aqui</p>
        )}
      </div>
    </div>
  );
}

/**
 * PERFORMANCE (auditoria 2026-08-22) — comparador padrão basta aqui: desde
 * esta rodada `PipelineBoard` entrega `conversations` por `useMemo` e todos
 * os handlers por `useCallback` estáveis, então as únicas props que mudam de
 * verdade são `draggedId` e `dragOver` — exatamente as duas que DEVEM
 * provocar re-render (feedback visual do arrasto).
 */
export default memo(PipelineColumn);
