import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Kanban } from 'lucide-react';
import { PIPELINE_COLUMN_ORDER, NOT_CLIENT_COLUMN, type PipelineColumnKey } from '@/lib/formatters';
import { groupConversationsByPipelineColumn } from '@/lib/conversationsView';
import { updateConversationStage, setConversationExcludedFromPipeline } from '@/lib/clientApi';
import { toast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/states/EmptyState';
import ErrorState from '@/components/states/ErrorState';
import PipelineColumn from './PipelineColumn';
import { usePipelineConversations, MAX_PIPELINE_PAGES } from '@/hooks/usePipelineConversations';
import type { ConversationSummary } from '@/lib/clientApi';

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
 *
 * PERFORMANCE (auditoria 2026-08-22) — três mudanças, nenhuma visual:
 * 1. `groups`/`totalCount` saíram do corpo do componente para `useMemo`.
 *    Antes, `groupConversationsByPipelineColumn(conversations)` reagrupava o
 *    array INTEIRO a cada render — inclusive a cada `dragEnter` durante o
 *    arrasto, que é exatamente o momento em que o quadro precisa responder
 *    a 60fps.
 * 2. Todos os handlers passados às colunas viraram `useCallback` estáveis.
 *    `moveConversation` lê `conversations` por `ref`, não por closure, então
 *    é estável para sempre sem nunca enxergar dado velho — é isso que
 *    viabiliza o `React.memo` de `PipelineCard`.
 * 3. `draggedIdRef` espelha o `draggedId` para que o handler de drop não
 *    precise do state nas dependências (o state continua existindo só para o
 *    feedback visual do card arrastado).
 */
export default function PipelineBoard({ sessionName }: PipelineBoardProps): JSX.Element {
  const { conversations, loading, errorMessage, truncated, refresh, applyLocalUpdate } =
    usePipelineConversations(sessionName);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<PipelineColumnKey | null>(null);

  // Espelhos por ref: mantêm os callbacks abaixo estáveis (deps vazias ou
  // mínimas) sem nunca lerem valor obsoleto — a leitura acontece no momento
  // da chamada, não no momento em que a closure foi criada.
  const conversationsRef = useRef<ConversationSummary[]>(conversations);
  const draggedIdRef = useRef<string | null>(draggedId);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    draggedIdRef.current = draggedId;
  }, [draggedId]);

  const groups = useMemo(() => groupConversationsByPipelineColumn(conversations), [conversations]);
  const totalCount = useMemo(
    () => conversations.filter((conversation) => !conversation.excludedFromPipeline).length,
    [conversations],
  );

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
   *
   * `moveConversation` é o caminho COMUM entre arrastar-e-soltar e a
   * alternativa por teclado/clique (`<select>` em cada `PipelineCard`,
   * achado de auditoria de acessibilidade 2026-08-22 — Web Interface
   * Guidelines: "gestos precisam de alternativa por toque/clique e
   * teclado"). Nenhuma lógica de gravação duplicada entre os dois fluxos.
   */
  const moveConversation = useCallback(
    async (conversationId: string, targetColumn: PipelineColumnKey): Promise<void> => {
      const conversation = conversationsRef.current.find((item) => item.id === conversationId);
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
    },
    [applyLocalUpdate, refresh],
  );

  const handleDragEnd = useCallback(() => setDraggedId(null), []);

  const handleDropOnColumn = useCallback(
    (targetColumn: PipelineColumnKey) => {
      setDragOverColumn(null);
      const conversationId = draggedIdRef.current;
      setDraggedId(null);
      if (!conversationId) return;
      void moveConversation(conversationId, targetColumn);
    },
    [moveConversation],
  );

  const handleMoveCard = useCallback(
    (conversationId: string, targetColumn: PipelineColumnKey) => {
      void moveConversation(conversationId, targetColumn);
    },
    [moveConversation],
  );

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

  return (
    <div className="flex h-full flex-col">
      {header}
      {/*
        Teto de carga atingido (auditoria 2026-08-22): o board mostra um
        recorte, não a sessão inteira. Dizer isso é obrigatório — esconder
        seria a mesma "perda silenciosa de dado" que a auditoria encontrou na
        lista de destinatários de campanha.
      */}
      {truncated && (
        <p
          role="status"
          className="mx-6 mb-2.5 shrink-0 rounded-md bg-warning/[.12] px-3 py-2 text-[12px] text-warning-emphasis"
        >
          Mostrando as {MAX_PIPELINE_PAGES * 100} conversas mais recentes desta sessão. As mais
          antigas não aparecem no funil.
        </p>
      )}
      <div className="fx-scroll flex flex-1 gap-3.5 overflow-x-auto overflow-y-hidden px-6 pb-5">
        {PIPELINE_COLUMN_ORDER.map((column) => (
          <PipelineColumn
            key={column}
            column={column}
            conversations={groups[column]}
            draggedId={draggedId}
            onDragStart={setDraggedId}
            onDragEnd={handleDragEnd}
            dragOver={dragOverColumn === column}
            onDragEnterColumn={setDragOverColumn}
            onDropOnColumn={handleDropOnColumn}
            onMoveCard={handleMoveCard}
          />
        ))}
      </div>
    </div>
  );
}
