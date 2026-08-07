import { useState } from 'react';
import { Kanban } from 'lucide-react';
import { PIPELINE_COLUMN_ORDER, NOT_CLIENT_COLUMN, type PipelineColumnKey } from '@/lib/formatters';
import { groupConversationsByPipelineColumn } from '@/lib/conversationsView';
import { updateConversationStage, setConversationExcludedFromPipeline } from '@/lib/clientApi';
import { toast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/states/EmptyState';
import ErrorState from '@/components/states/ErrorState';
import PipelineColumn from './PipelineColumn';
import { usePipelineConversations } from '@/hooks/usePipelineConversations';

interface PipelineBoardProps {
  sessionName: string;
}

/**
 * Board Kanban do Pipeline de CRM (Milestone 6, Bloco M6H-5) — escolha
 * explícita do fundador ("Board Kanban visual, arrastar card entre
 * colunas"), não um simples seletor de estágio dentro da conversa.
 *
 * Drag-and-drop via HTML5 Drag and Drop API nativa (sem `dnd-kit`/
 * `@hello-pangea/dnd`): o sandbox de desenvolvimento não roda `npm install`
 * de pacotes novos, e o projeto já tem precedente de preferir uma API nativa
 * a uma dependência nova quando ela resolve o problema (`GeminiAiProvider`
 * usa `fetch` cru em vez de SDK, ver DECISIONS.md).
 *
 * Atualização OTIMISTA: ao soltar um card, a coluna muda na hora
 * (`applyLocalUpdate`) e a chamada à API roda em paralelo; se falhar, o board
 * é recarregado do zero (`refresh`) e um toast destrutivo avisa — nunca
 * deixa o board mentindo sobre o estado real.
 *
 * Reskin 2026-08-07 (Design System, tela Pipeline) — o cabeçalho da tela
 * (título "Pipeline" + subtítulo + contagem total) migrou de `pipeline.tsx`
 * para dentro deste componente: o mockup nasce inteiro dentro de UMA
 * `<section>` (cabeçalho + board), e só este componente sabe o total de
 * conversas no funil (`totalCount`, exclui "Não cliente" — mesmo cálculo do
 * mockup: `s.cards.filter(c => c.stage !== "excluded").length`). O
 * cabeçalho fica visível SEMPRE (mesmo durante loading/erro/vazio) — só a
 * contagem à direita depende dos dados terem chegado.
 */
export default function PipelineBoard({ sessionName }: PipelineBoardProps): JSX.Element {
  const { conversations, loading, errorMessage, refresh, applyLocalUpdate } =
    usePipelineConversations(sessionName);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<PipelineColumnKey | null>(null);

  const totalCount = conversations.filter(
    (conversation) => !conversation.excludedFromPipeline,
  ).length;

  const header = (
    <div className="flex shrink-0 items-baseline justify-between px-6 pb-3.5 pt-5">
      <div>
        <h1 className="text-[21px] font-semibold tracking-tight text-foreground">Pipeline</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Funil de vendas da sessão {sessionName}.
        </p>
      </div>
      {!loading && !errorMessage && conversations.length > 0 && (
        <span className="shrink-0 text-[12.5px] text-muted-foreground">
          {totalCount} conversas no funil
        </span>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex flex-1 gap-3.5 overflow-x-auto px-6 pb-5">
          {PIPELINE_COLUMN_ORDER.map((column) => (
            <div key={column} className="w-[268px] shrink-0 space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex-1 px-6">
          <ErrorState description={errorMessage} onRetry={refresh} />
        </div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex-1 px-6">
          <EmptyState
            icon={Kanban}
            title="Nenhuma conversa nesta sessão ainda"
            description="Assim que o primeiro contato chegar, ele aparece aqui no estágio Novo."
          />
        </div>
      </div>
    );
  }

  const groups = groupConversationsByPipelineColumn(conversations);

  /**
   * ADR #96: mover um card pode envolver DUAS gravações distintas, porque a
   * coluna "Não cliente" é derivada de `excludedFromPipeline` e as outras
   * cinco de `stage`:
   * - entrar em "Não cliente" → só liga a flag (o `stage` antigo é
   *   preservado de propósito, ver `groupConversationsByPipelineColumn`);
   * - sair de "Não cliente" para um estágio → desliga a flag E grava o
   *   estágio de destino, na ordem (a flag primeiro: se a segunda chamada
   *   falhar, o card volta ao funil no estágio antigo — estado benigno e
   *   visível depois do `refresh()`, nunca dado corrompido);
   * - mover entre dois estágios do funil → comportamento original (M6H-5).
   */
  async function handleDrop(targetColumn: PipelineColumnKey): Promise<void> {
    setDragOverColumn(null);
    const conversationId = draggedId;
    setDraggedId(null);
    if (!conversationId) return;

    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    const currentColumn: PipelineColumnKey = conversation.excludedFromPipeline
      ? NOT_CLIENT_COLUMN
      : conversation.stage;
    if (currentColumn === targetColumn) return;

    const movingToNotClient = targetColumn === NOT_CLIENT_COLUMN;
    const optimistic = movingToNotClient
      ? { ...conversation, excludedFromPipeline: true }
      : {
          ...conversation,
          excludedFromPipeline: false,
          stage: targetColumn,
          stageSetBy: 'human' as const,
          stageUpdatedAt: new Date().toISOString(),
        };
    applyLocalUpdate(optimistic);

    try {
      if (movingToNotClient) {
        applyLocalUpdate(await setConversationExcludedFromPipeline(conversationId, true));
        return;
      }

      if (conversation.excludedFromPipeline) {
        await setConversationExcludedFromPipeline(conversationId, false);
      }
      applyLocalUpdate(await updateConversationStage(conversationId, targetColumn));
    } catch {
      toast({
        variant: 'destructive',
        title: 'Não foi possível mover a conversa',
        description: 'Tente novamente em instantes.',
      });
      refresh();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="fx-scroll flex flex-1 gap-3.5 overflow-x-auto overflow-y-hidden px-6 pb-5">
        {PIPELINE_COLUMN_ORDER.map((column) => (
          <PipelineColumn
            key={column}
            column={column}
            conversations={groups[column]}
            draggedId={draggedId}
            onDragStart={setDraggedId}
            onDragEnd={() => setDraggedId(null)}
            dragOver={dragOverColumn === column}
            onDragEnterColumn={setDragOverColumn}
            onDropOnColumn={(targetColumn) => {
              void handleDrop(targetColumn);
            }}
          />
        ))}
      </div>
    </div>
  );
}
