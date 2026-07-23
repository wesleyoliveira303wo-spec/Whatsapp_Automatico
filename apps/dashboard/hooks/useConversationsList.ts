import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEventSource } from './useEventSource';
import { fetchConversations } from '../lib/clientApi';
import { mergeConversationPages } from '../lib/conversationsView';
import type { ConversationPage, ConversationStatus, ConversationSummary } from '../lib/clientApi';

/** Mesmo envelope `{ status, body }` que `runSsePoller` grava em cada frame `data:` — ver `useSessionsList.ts` (M2). */
interface ConversationsStreamFrame {
  status: number;
  body: ConversationPage;
}

export interface UseConversationsListResult {
  conversations: ConversationSummary[];
  loading: boolean;
  errorMessage: string | null;
  connected: boolean;
  /** D24 — busca a proxima pagina via fetch simples e acumula. */
  loadMore: () => void;
  loadingMore: boolean;
  hasMore: boolean;
}

/**
 * Lista de conversas do tenant (Milestone 3, Bloco 6 — D23/D24/D25).
 * Estrategia hibrida aprovada em D23: a PRIMEIRA pagina fica viva via SSE
 * (`/api/conversations/stream`, poll ~2s no BFF); paginas seguintes
 * ("Carregar mais") sao buscadas via fetch simples e acumuladas em estado
 * local, com dedupe por id (`mergeConversationPages` — logica pura,
 * testada sem jsdom, D29).
 *
 * `status` (D25) e resolvido no SERVIDOR: trocar o filtro muda a URL do SSE
 * (reconexao via dep do `useEventSource`) e reseta as paginas acumuladas —
 * nunca filtra client-side (incompativel com paginacao por cursor).
 */
export function useConversationsList(status?: ConversationStatus): UseConversationsListResult {
  const streamUrl = `/api/conversations/stream${status ? `?status=${status}` : ''}`;
  const { data, errorMessage: transientErrorMessage, connected } = useEventSource<ConversationsStreamFrame>(streamUrl);

  const [loadedPages, setLoadedPages] = useState<ConversationSummary[][]>([]);
  const [loadedCursor, setLoadedCursor] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Trocar o filtro invalida as paginas acumuladas (elas foram buscadas com
  // outro `status`) — reset completo, a pagina viva nova chega pelo SSE.
  useEffect(() => {
    setLoadedPages([]);
    setLoadedCursor(undefined);
    setLoadMoreError(null);
  }, [status]);

  const livePage = useMemo(() => {
    if (!data || data.status !== 200) return [];
    return data.body.conversations;
  }, [data]);

  const liveCursor = data && data.status === 200 ? data.body.nextCursor : undefined;
  // O cursor efetivo e o da ULTIMA pagina buscada (se houver), senao o da
  // pagina viva — "Carregar mais" sempre continua do fim do que ja se ve.
  const effectiveCursor = loadedPages.length > 0 ? loadedCursor : liveCursor;

  const loadMore = useCallback(() => {
    if (!effectiveCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    fetchConversations({ status, cursor: effectiveCursor })
      .then((page) => {
        setLoadedPages((pages) => [...pages, page.conversations]);
        setLoadedCursor(page.nextCursor);
      })
      .catch(() => {
        setLoadMoreError('Falha ao carregar mais conversas. Tente novamente.');
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }, [effectiveCursor, loadingMore, status]);

  const conversations = useMemo(() => mergeConversationPages(livePage, loadedPages), [livePage, loadedPages]);

  const errorMessage =
    data && data.status !== 200 ? `Falha ao carregar conversas (status ${data.status}).` : (loadMoreError ?? transientErrorMessage);

  return {
    conversations,
    loading: data === null,
    errorMessage,
    connected,
    loadMore,
    loadingMore,
    hasMore: effectiveCursor !== undefined,
  };
}
