import Link from 'next/link';
import { forwardRef, memo, useEffect, useRef, type DragEvent, type Ref } from 'react';
import { motion } from 'framer-motion';
import { Bot, ChevronDown, User } from 'lucide-react';
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
/**
 * Onda 2 do redesign (2026-08-23) — `forwardRef` (não existia antes desta
 * rodada) é exigido pelo `AnimatePresence` de `PipelineColumn`: ela gerencia
 * a animação de saída dos filhos anexando uma `ref` ao elemento direto que
 * renderiza dentro dela (`<PipelineCard>`) para saber quando o nó real já
 * saiu do DOM. Sem `forwardRef`, o React emitia
 * "Function components cannot be given refs" — confirmado no console dos
 * testes — e a animação de saída silenciosamente não funcionava (a falha é
 * SILENCIOSA porque `AnimatePresence` degrada para "sem exit" em vez de
 * quebrar a tela, então só o warning denunciava o problema).
 */
function PipelineCardImpl(
  { conversation, onDragStart, onDragEnd, dragging = false, onMoveToColumn }: PipelineCardProps,
  forwardedRef: Ref<HTMLDivElement>,
): JSX.Element {
  const classificadoPorHumano = conversation.stageSetBy === 'human';
  const currentColumn: PipelineColumnKey = conversation.excludedFromPipeline
    ? NOT_CLIENT_COLUMN
    : conversation.stage;

  /**
   * `motion.div` REDEFINE `onDragStart`/`onDragEnd` para o próprio sistema
   * de gestos por ponteiro do framer-motion (assinatura incompatível com o
   * `DragEvent` nativo do HTML5, confirmado pelo `tsc`: espera `(event:
   * MouseEvent | TouchEvent | PointerEvent, info: PanInfo)`). Em vez de um
   * cast às cegas torcendo pra funcionar em runtime, os listeners nativos
   * são anexados por `ref` + `addEventListener('dragstart'/'dragend', ...)`
   * — DOM puro, sem intermediação nenhuma do framer-motion, então o
   * comportamento é IDÊNTICO ao `<div draggable>` de antes desta rodada, e o
   * `drag`/pointer do framer-motion nunca é sequer tocado (nem `drag` nem
   * `whileDrag` estão presentes neste componente). Usa a MESMA ref recebida
   * de `AnimatePresence` (não uma segunda ref própria) — um único nó DOM,
   * duas razões de precisar dele.
   */
  const dragTargetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = dragTargetRef.current;
    if (!node) return;
    const handleDragStart = (event: globalThis.DragEvent): void =>
      onDragStart(event as unknown as DragEvent<HTMLDivElement>);
    const handleDragEnd = (event: globalThis.DragEvent): void =>
      onDragEnd(event as unknown as DragEvent<HTMLDivElement>);
    node.addEventListener('dragstart', handleDragStart);
    node.addEventListener('dragend', handleDragEnd);
    return () => {
      node.removeEventListener('dragstart', handleDragStart);
      node.removeEventListener('dragend', handleDragEnd);
    };
  }, [onDragStart, onDragEnd]);

  return (
    <motion.div
      ref={mergeRefs(dragTargetRef, forwardedRef)}
      draggable
      // Onda 2 do redesign (2026-08-23) — `layout` faz o framer-motion animar
      // a POSIÇÃO do card sempre que ela muda entre renders (reordenar dentro
      // da coluna, quando `stageUpdatedAt` põe o card recém-tocado no topo);
      // `initial`/`animate`/`exit` cobrem o card aparecendo/saindo de uma
      // coluna (mudança de estágio) — sem `AnimatePresence` em
      // `PipelineColumn`, `exit` seria ignorado e o card sumiria sem
      // transição.
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        // `group`: sustenta o `group-hover`/`group-focus-within` do seletor
        // "Mover…" na última linha (Onda 1 do redesign).
        'group cursor-grab rounded-lg border border-border bg-card px-3 py-[11px] transition-colors active:cursor-grabbing',
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

      {/*
        ONDA 1 DO REDESIGN (2026-08-22) — esta linha concentrava dois defeitos
        visíveis na tela real:

        1. O `<select>` usava a aparência NATIVA do sistema operacional (caixa
           cinza do Windows com seta própria) dentro de um card que o Design
           System define como superfície limpa. `appearance-none` + tokens do
           DS + um chevron desenhado resolvem isso SEM trocar o controle: um
           `<select>` nativo é operável por teclado e leitor de tela de graça,
           e trocá-lo por um menu customizado significaria reimplementar essa
           acessibilidade à mão — perder o que a auditoria acabou de ganhar.

        2. O tempo no estágio aparecia cortado ("há 4 di…", "IA de…") porque
           três elementos disputavam a mesma linha estreita de 268px — e numa
           coluna com barra de rolagem sobrava ainda menos. As duas ações
           (mover / abrir) saíram do FLUXO da linha: ficam `absolute`,
           invisíveis em repouso, e aparecem no hover do card ou quando algo
           dentro dele recebe foco (`group-focus-within`). Só `opacity-0` não
           bastava — um elemento transparente continua reservando largura.
           Continuam SEMPRE no DOM e focáveis: diferente de `hidden`,
           `opacity` não tira da ordem de tabulação nem do leitor de tela, e o
           `focus-within` traz o bloco de volta à vista ao chegar por Tab.
      */}
      <div className="relative mt-[9px] flex items-center justify-between gap-2">
        {/*
          Onda 1 do redesign — o rótulo era "há 4 dias neste estágio" e vinha
          cortado ao meio ("há 4 d…") em TODO card: 268px de coluna não
          comportam esse texto mais o seletor mais o link. "neste estágio"
          era redundante — o card já vive dentro da coluna do estágio, e o
          `title` guarda a frase completa para quem passar o mouse.
        */}
        <span
          className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
          title={
            conversation.excludedFromPipeline
              ? 'A IA não responde automaticamente nesta conversa'
              : `${formatElapsedDays(conversation.stageUpdatedAt)} neste estágio`
          }
        >
          {conversation.excludedFromPipeline
            ? 'IA desligada'
            : formatElapsedDays(conversation.stageUpdatedAt)}
        </span>
        <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-md bg-card pl-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <div className="relative">
            <select
              aria-label="Mover conversa para outro estágio do Pipeline"
              title="Mover para outro estágio"
              value=""
              onChange={(event) => {
                const target = event.target.value as PipelineColumnKey | '';
                event.target.value = '';
                if (target) onMoveToColumn(target);
              }}
              className="cursor-pointer appearance-none rounded-md border border-border bg-card py-0.5 pl-[7px] pr-[18px] text-[10.5px] font-medium text-foreground-secondary outline-none transition-colors hover:border-foreground/25 hover:bg-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
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
            <ChevronDown
              className="pointer-events-none absolute right-[5px] top-1/2 h-[11px] w-[11px] -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <Link
            href={`/sessions/${encodeURIComponent(conversation.sessionName)}/conversations/${encodeURIComponent(conversation.id)}`}
            className="rounded text-[11px] font-semibold text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Ver conversa <span aria-hidden="true">›</span>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

/** Combina duas refs (a interna de drag + a que `AnimatePresence` injeta) num único callback ref — nenhuma lib nova, padrão React comum para este exato cenário. */
function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): (node: T | null) => void {
  return (node) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

const PipelineCard = forwardRef(PipelineCardImpl);

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
