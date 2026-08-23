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

/** Compara as tags de duas conversas por conteudo (id/name/color sao todos escalares). */
function sameConversationTags(
  a: ConversationSummary['tags'],
  b: ConversationSummary['tags'],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index].id !== b[index].id) return false;
    if (a[index].name !== b[index].name) return false;
    if (a[index].color !== b[index].color) return false;
  }
  return true;
}

/**
 * Igualdade ESTRUTURAL rasa de `ConversationSummary`. Rasa e suficiente
 * porque todo campo da interface e escalar, com uma unica excecao (`tags`,
 * tratada acima). Compara tambem a quantidade de chaves, para detectar um
 * campo opcional que apareceu ou sumiu entre dois frames.
 */
function sameConversation(a: ConversationSummary, b: ConversationSummary): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as (keyof ConversationSummary)[];
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (key === 'tags') {
      if (!sameConversationTags(a.tags, b.tags)) return false;
      continue;
    }
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Estabiliza a IDENTIDADE dos objetos entre dois frames da lista viva
 * (auditoria 2026-08-22).
 *
 * Por que existe: a primeira pagina da lista chega por SSE a cada ~2s
 * (`SSE_POLL_INTERVAL_MS`), e cada frame passa por `JSON.parse` — ou seja,
 * TODA conversa vira um objeto novo a cada 2 segundos, mesmo quando nada
 * mudou nela. Com isso, `React.memo` em `ConversationListItem` seria
 * completamente inutil (a prop `conversation` nunca seria a mesma
 * referencia), e a lista inteira era reconciliada 30x por minuto,
 * indefinidamente, enquanto a aba estivesse aberta.
 *
 * Esta funcao devolve um array em que cada conversa cujo CONTEUDO nao mudou
 * mantem a referencia do frame anterior. Quando nada mudou em nenhuma delas
 * (o caso comum), devolve o proprio array anterior — assim ate o `useMemo`
 * de quem consome para de invalidar.
 *
 * Pura de proposito (mesmo racional de `mergeConversationPages`): testavel no
 * projeto `dashboard` (node, sem jsdom).
 */
export function reconcileConversationIdentities(
  previous: ConversationSummary[],
  next: ConversationSummary[],
): ConversationSummary[] {
  if (previous.length === 0) return next;

  const previousById = new Map(previous.map((conversation) => [conversation.id, conversation]));
  let identicalToPrevious = previous.length === next.length;

  const reconciled = next.map((conversation, index) => {
    const earlier = previousById.get(conversation.id);
    if (earlier && sameConversation(earlier, conversation)) {
      // Mesmo conteudo, mas pode ter mudado de POSICAO (uma conversa nova
      // desloca a lista) — nesse caso o array precisa ser novo, ainda que
      // todos os itens sejam reaproveitados.
      if (previous[index] !== earlier) identicalToPrevious = false;
      return earlier;
    }
    identicalToPrevious = false;
    return conversation;
  });

  return identicalToPrevious ? previous : reconciled;
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
