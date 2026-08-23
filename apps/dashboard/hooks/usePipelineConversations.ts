import { useCallback, useEffect, useState } from 'react';
import { fetchConversations } from '../lib/clientApi';
import type { ConversationSummary } from '../lib/clientApi';

/** Itens por requisição — mesmo tamanho de página já usado por "Carregar mais" (D24). */
const PAGE_SIZE = 100;

/**
 * Teto de páginas do board (auditoria 2026-08-22). Antes desta rodada o laço
 * era `do { ... } while (cursor)` SEM limite: `limit: 100` é o tamanho da
 * PÁGINA, não do total, então uma sessão com 10.000 conversas dispararia 100
 * requisições sequenciais e acumularia 10.000 objetos em memória — o único
 * ponto do produto capaz de travar o navegador de fato.
 *
 * 20 páginas = 2.000 conversas. Escolhido com folga de ~34x sobre o volume
 * real medido na maior sessão hoje (58 conversas), mas baixo o bastante para
 * que o pior caso continue sendo uma tela que abre. Ao bater no teto o board
 * NÃO mente: devolve `truncated: true` e a UI avisa (ver `PipelineBoard`) —
 * mesma disciplina anti-invenção-de-dado já aplicada no funil de Analytics.
 */
export const MAX_PIPELINE_PAGES = 20;

export interface UsePipelineConversationsResult {
  conversations: ConversationSummary[];
  loading: boolean;
  errorMessage: string | null;
  /**
   * `true` quando o teto de `MAX_PIPELINE_PAGES` foi atingido e AINDA havia
   * cursor — ou seja, o board está mostrando um recorte, não a sessão
   * inteira. A UI precisa dizer isso ao operador.
   */
  truncated: boolean;
  refresh: () => void;
  /**
   * Sobrescreve LOCALMENTE (otimista) uma conversa já carregada — usado pelo
   * board ao soltar um card numa coluna nova, sem esperar um refetch
   * completo. Mesmo racional de `useConversationsList.applyLocalUpdate`
   * (M6H-2/2b), mas aqui não há um próximo tick de SSE para "expirar" o
   * override sozinho — o board chama `refresh()` depois de confirmar a
   * gravação no servidor (ver `PipelineBoard`), então o override dura só o
   * tempo entre o drop e a resposta da API.
   */
  applyLocalUpdate: (conversation: ConversationSummary) => void;
}

/**
 * Pipeline de CRM (Milestone 6, Bloco M6H-5) — carrega as conversas de uma
 * sessão para montar o board Kanban. Deliberadamente NÃO usa
 * `useConversationsList` (SSE + paginação por cursor, D23/D24): o board
 * precisa do conjunto agrupado por `stage`, não de uma lista
 * incrementalmente carregada e filtrada por `status` — os dois modelos de
 * dado são incompatíveis (um card "Fechado" antigo, por exemplo, nunca
 * apareceria numa lista pensada para status `bot`/`human`).
 *
 * Estratégia: busca por fetch simples (`fetchConversations`, já usado por
 * "Carregar mais" em D24) em laço, acumulando em memória, ATÉ o cursor
 * acabar ou o teto de `MAX_PIPELINE_PAGES` ser atingido — o que vier antes.
 * Paginação real por coluna (agregada no servidor) continua sendo o caminho
 * certo se o teto passar a ser atingido com frequência.
 */
export function usePipelineConversations(sessionName: string): UsePipelineConversationsResult {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadAll(): Promise<void> {
      setLoading(true);
      setErrorMessage(null);
      try {
        const all: ConversationSummary[] = [];
        let cursor: string | undefined;
        let pages = 0;
        do {
          // eslint-disable-next-line no-await-in-loop -- paginação sequencial deliberada, mesmo padrão de "Carregar mais" (D24).
          // ADR #96 (2026-08-01): o board carrega TODAS as conversas da
          // sessão, inclusive as marcadas como fora do funil comercial — elas
          // deixaram de desaparecer da tela e passaram a viver numa coluna
          // própria ("Não cliente"). A ADR #94 filtrava
          // `excludedFromPipeline: false` aqui, o que tornava a marcação
          // invisível e irreversível na prática (nenhuma tela listava as
          // conversas marcadas).
          const page = await fetchConversations({ sessionName, cursor, limit: PAGE_SIZE });
          all.push(...page.conversations);
          cursor = page.nextCursor;
          pages += 1;
        } while (cursor && pages < MAX_PIPELINE_PAGES);
        if (!cancelled) {
          setConversations(all);
          // Sobrou cursor depois de esgotar o teto = existe mais do que cabe no board.
          setTruncated(cursor !== undefined);
        }
      } catch {
        if (!cancelled) {
          setErrorMessage('Falha ao carregar as conversas desta sessão. Tente novamente.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [sessionName, reloadToken]);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const applyLocalUpdate = useCallback((conversation: ConversationSummary) => {
    setConversations((current) =>
      current.map((item) => (item.id === conversation.id ? conversation : item)),
    );
  }, []);

  return { conversations, loading, errorMessage, truncated, refresh, applyLocalUpdate };
}
