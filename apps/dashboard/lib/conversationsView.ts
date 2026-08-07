import { NOT_CLIENT_COLUMN, type PipelineColumnKey } from './formatters';
import type { ConversationSummary } from './clientApi';

/**
 * Funcoes PURAS de composicao da lista de conversas (Milestone 3, Bloco 6 —
 * D23/D24). Extraidas de `useConversationsList` para serem testaveis no
 * ambiente atual (`testEnvironment: 'node'`, sem jsdom — D29), mesmo
 * racional de `formatters.ts`/`parseJsonSafely.ts` (M2, Fase 4).
 *
 * Por que existe: a PRIMEIRA pagina da lista fica viva via SSE (~2s, D23) e
 * as paginas seguintes ("Carregar mais", D24) sao buscadas uma vez e
 * acumuladas. Quando uma conversa nova chega, a primeira pagina desloca —
 * o ultimo item dela pode passar a duplicar o primeiro item de uma pagina
 * ja acumulada. Este merge dedupe por `id`, mantendo a PRIMEIRA ocorrencia
 * (a versao da pagina viva e sempre a mais recente, entao ela vence).
 */
export function mergeConversationPages(
  livePage: ConversationSummary[],
  loadedPages: ConversationSummary[][],
): ConversationSummary[] {
  const seen = new Set<string>();
  const merged: ConversationSummary[] = [];
  for (const conversation of [...livePage, ...loadedPages.flat()]) {
    if (seen.has(conversation.id)) continue;
    seen.add(conversation.id);
    merged.push(conversation);
  }
  return merged;
}

/** Busca uma conversa por `id` numa lista ja carregada — `undefined` se ausente (quem chama decide o fallback). */
export function findConversationById(
  conversations: ConversationSummary[],
  id: string,
): ConversationSummary | undefined {
  return conversations.find((conversation) => conversation.id === id);
}

/**
 * Agrupa conversas nas COLUNAS do board Kanban — pipeline de CRM (Milestone
 * 6, Bloco M6H-5; coluna "Não cliente" acrescentada em 2026-08-01, ADR #96).
 * Função pura extraída de `PipelineBoard` pelo mesmo racional de
 * `mergeConversationPages` acima: testável sem jsdom. Dentro de cada
 * coluna, ordena por `stageUpdatedAt` DESC (card mais recentemente
 * classificado/movido primeiro) — mesmo espírito de "atividade recente no
 * topo" já usado em `findAllByTenant` (`apps/api`), mas aplicado ao
 * timestamp de estágio, não ao de atividade geral da conversa (os dois
 * campos existem justamente para essa distinção, ver ADR #83+1).
 *
 * REGRA DE DERIVAÇÃO (ADR #96): `excludedFromPipeline === true` manda a
 * conversa para a coluna "Não cliente" INDEPENDENTE do `stage` que ela
 * carregue por baixo. O `stage` antigo é deliberadamente preservado no dado
 * (não é zerado ao marcar) — assim, sair da coluna é uma escolha explícita de
 * destino no arrastar-e-soltar, sem precisar adivinhar de onde o card veio.
 */
export function groupConversationsByPipelineColumn(
  conversations: ConversationSummary[],
): Record<PipelineColumnKey, ConversationSummary[]> {
  const groups: Record<PipelineColumnKey, ConversationSummary[]> = {
    new: [],
    contacted: [],
    negotiating: [],
    closed_won: [],
    closed_lost: [],
    [NOT_CLIENT_COLUMN]: [],
  };
  for (const conversation of conversations) {
    const column: PipelineColumnKey = conversation.excludedFromPipeline
      ? NOT_CLIENT_COLUMN
      : conversation.stage;
    groups[column].push(conversation);
  }
  for (const column of Object.keys(groups) as PipelineColumnKey[]) {
    groups[column].sort(
      (a, b) => new Date(b.stageUpdatedAt).getTime() - new Date(a.stageUpdatedAt).getTime(),
    );
  }
  return groups;
}
