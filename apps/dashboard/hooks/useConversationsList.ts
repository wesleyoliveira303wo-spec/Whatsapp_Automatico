import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEventSource } from './useEventSource';
import { fetchConversations } from '../lib/clientApi';
import { mergeConversationPages, reconcileConversationIdentities } from '../lib/conversationsView';
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
  /**
   * Sobrescreve LOCALMENTE (otimista) uma conversa já carregada, sem esperar
   * o próximo tick do SSE (~2s) — usado por `ConversationDetailPanel` ao
   * marcar como lida (2026-07-26): sem isso, o badge de não lidas só some da
   * lista no próximo poll, dando a impressão de que "não sumiu". O override
   * fica em memória até o próximo frame do SSE trazer o dado real (que já
   * deve concordar, já que a escrita no servidor aconteceu antes desta
   * chamada) — não é persistido, só cobre o intervalo entre polls.
   */
  applyLocalUpdate: (conversation: ConversationSummary) => void;
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
 *
 * Milestone 6, Bloco M6H-2: `sessionName` segue o MESMO racional de `status`
 * — resolvido no servidor, nunca no cliente. Optional/retrocompatível:
 * ausente = todas as sessões do tenant (nenhuma tela chama assim hoje, mas o
 * comportamento antigo continua disponível).
 *
 * Redesign 2026-08-05 (R3): `needsHumanAttention` (filtro "Aguardando" da
 * nova `ConversationFilterTabs`) segue o MESMO racional — resolvido no
 * servidor (a API já suporta `?needsHumanAttention=true`, usado até aqui só
 * por `useWaitingForHuman`), nunca combinado com `status` na mesma chamada
 * (mutuamente exclusivos na UI: a barra de filtros só deixa escolher um).
 */
export function useConversationsList(
  status?: ConversationStatus,
  sessionName?: string,
  needsHumanAttention?: boolean,
): UseConversationsListResult {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (sessionName) query.set('sessionName', sessionName);
  if (needsHumanAttention) query.set('needsHumanAttention', 'true');
  const queryString = query.toString();
  const streamUrl = `/api/conversations/stream${queryString ? `?${queryString}` : ''}`;
  const {
    data,
    errorMessage: transientErrorMessage,
    connected,
  } = useEventSource<ConversationsStreamFrame>(streamUrl);

  const [loadedPages, setLoadedPages] = useState<ConversationSummary[][]>([]);
  const [loadedCursor, setLoadedCursor] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  // Overrides otimistas por id — ver docstring de `applyLocalUpdate` em `UseConversationsListResult`.
  const [localOverrides, setLocalOverrides] = useState<Record<string, ConversationSummary>>({});

  // Trocar o filtro invalida as paginas acumuladas (elas foram buscadas com
  // outro `status`/`sessionName`) — reset completo, a pagina viva nova chega
  // pelo SSE.
  useEffect(() => {
    setLoadedPages([]);
    setLoadedCursor(undefined);
    setLoadMoreError(null);
    setLocalOverrides({});
  }, [status, sessionName, needsHumanAttention]);

  const applyLocalUpdate = useCallback((conversation: ConversationSummary) => {
    setLocalOverrides((overrides) => ({ ...overrides, [conversation.id]: conversation }));
  }, []);

  /**
   * PERFORMANCE (auditoria 2026-08-22) — cada frame do SSE passa por
   * `JSON.parse`, então TODA conversa vira um objeto novo a cada ~2s, mesmo
   * sem nenhuma mudança. `reconcileConversationIdentities` reaproveita a
   * referência anterior de cada conversa cujo conteúdo não mudou; é isso que
   * faz o `React.memo` de `ConversationListItem` valer alguma coisa (sem
   * essa reconciliação ele nunca acertaria a comparação e a lista inteira
   * seria reconstruída 30x por minuto, indefinidamente).
   *
   * O acumulador vive num `ref` porque precisa atravessar frames. Reconciliar
   * é idempotente (reconciliar contra o já reconciliado devolve o mesmo
   * array), então a dupla execução do `useMemo` em StrictMode é inofensiva.
   */
  const stableLivePageRef = useRef<ConversationSummary[]>([]);
  const livePage = useMemo(() => {
    if (!data || data.status !== 200) {
      stableLivePageRef.current = [];
      return stableLivePageRef.current;
    }
    stableLivePageRef.current = reconcileConversationIdentities(
      stableLivePageRef.current,
      data.body.conversations,
    );
    return stableLivePageRef.current;
  }, [data]);

  const liveCursor = data && data.status === 200 ? data.body.nextCursor : undefined;
  // O cursor efetivo e o da ULTIMA pagina buscada (se houver), senao o da
  // pagina viva — "Carregar mais" sempre continua do fim do que ja se ve.
  const effectiveCursor = loadedPages.length > 0 ? loadedCursor : liveCursor;

  const loadMore = useCallback(() => {
    if (!effectiveCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    fetchConversations({ status, sessionName, needsHumanAttention, cursor: effectiveCursor })
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
  }, [effectiveCursor, loadingMore, status, sessionName, needsHumanAttention]);

  const merged = useMemo(
    () => mergeConversationPages(livePage, loadedPages),
    [livePage, loadedPages],
  );

  // Aplica os overrides otimistas por cima do que veio do servidor. Um
  // override "expira" sozinho assim que o SSE trouxer, para aquele id, um
  // `updatedAt` igual ou mais novo (o servidor já reflete a mudança — não há
  // mais necessidade de sobrescrever, e continuar sobrescrevendo poderia
  // esconder uma mudança real e mais recente vinda de outro lugar, ex.: nova
  // mensagem chegando logo após marcar como lida).
  useEffect(() => {
    if (Object.keys(localOverrides).length === 0) return;
    setLocalOverrides((overrides) => {
      let changed = false;
      const next = { ...overrides };
      for (const conversation of merged) {
        const override = next[conversation.id];
        if (
          override &&
          new Date(conversation.updatedAt).getTime() >= new Date(override.updatedAt).getTime()
        ) {
          delete next[conversation.id];
          changed = true;
        }
      }
      return changed ? next : overrides;
    });
  }, [merged, localOverrides]);

  const conversations = useMemo(
    () => merged.map((conversation) => localOverrides[conversation.id] ?? conversation),
    [merged, localOverrides],
  );

  const errorMessage =
    data && data.status !== 200
      ? `Falha ao carregar conversas (status ${data.status}).`
      : (loadMoreError ?? transientErrorMessage);

  return {
    conversations,
    loading: data === null,
    errorMessage,
    connected,
    loadMore,
    loadingMore,
    hasMore: effectiveCursor !== undefined,
    applyLocalUpdate,
  };
}
