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
export function findConversationById(conversations: ConversationSummary[], id: string): ConversationSummary | undefined {
  return conversations.find((conversation) => conversation.id === id);
}
