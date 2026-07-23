import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchConversations } from '../lib/clientApi';
import { findConversationById } from '../lib/conversationsView';
import { usePollingRefresh } from './usePollingRefresh';
import type { ConversationSummary } from '../lib/clientApi';

/** Teto de paginas varridas ao procurar a conversa por id (limite da API por pagina: 200 — ver MAX_LIST_LIMIT, Bloco 5). 5 paginas = ate 1000 conversas mais recentes. */
const MAX_LOOKUP_PAGES = 5;

export interface UseConversationDetailResult {
  conversation: ConversationSummary | null;
  loading: boolean;
  errorMessage: string | null;
  /** Rebusca a conversa (ex.: apos o usuario pedir atualizacao manual). */
  refresh: () => void;
  /** Aplica a `Conversation` devolvida por escalate/resume (D22) — evita rebuscar a lista so para refletir a acao. */
  applyUpdate: (conversation: ConversationSummary) => void;
}

/**
 * Detalhe de uma conversa (Milestone 3, Bloco 6). LIMITACAO CONHECIDA E
 * DOCUMENTADA: o backend do Bloco 5 nao expoe `GET /conversations/:id`
 * (decisao de escopo do proprio Bloco 5 — nenhum contrato foi alterado
 * neste bloco, conforme restricao aprovada). A conversa e localizada
 * varrendo a listagem paginada (`GET /conversations?limit=200`, seguindo
 * cursores ate `MAX_LOOKUP_PAGES`); conversas alem das ~1000 mais recentes
 * nao sao localizaveis por URL direta — registrado como melhoria de backend
 * a propor (endpoint de detalhe), ver documentacao do Bloco 6.
 *
 * Sem SSE aqui (D23: SSE so na lista): o status exibido e atualizado (a)
 * pelas respostas das proprias acoes escalate/resume (`applyUpdate`) e (b)
 * por `refresh()` manual.
 */
export function useConversationDetail(conversationId: string | null): UseConversationDetailResult {
  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  // Tempo real (N2-4): nos refreshes de polling não queremos piscar o
  // "Carregando…" nem apagar a conversa já exibida — só na 1ª carga.
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;

    const lookup = async (): Promise<void> => {
      if (!initialLoadDoneRef.current) setLoading(true);
      setErrorMessage(null);
      try {
        let cursor: string | undefined;
        for (let page = 0; page < MAX_LOOKUP_PAGES; page += 1) {
          const result = await fetchConversations({ limit: 200, cursor });
          if (cancelled) return;
          const found = findConversationById(result.conversations, conversationId);
          if (found) {
            setConversation(found);
            setErrorMessage(null);
            setLoading(false);
            initialLoadDoneRef.current = true;
            return;
          }
          if (!result.nextCursor) break;
          cursor = result.nextCursor;
        }
        // Não encontrada: só zera a tela na 1ª carga. Num refresh de polling,
        // mantém o que já estava exibido (evita "sumir" a conversa por uma
        // varredura transitória que não a alcançou).
        if (!initialLoadDoneRef.current) {
          setConversation(null);
          setErrorMessage('Conversa nao encontrada.');
          setLoading(false);
          initialLoadDoneRef.current = true;
        }
      } catch {
        if (cancelled) return;
        // Mesmo racional: erro num poll não derruba a conversa já carregada.
        if (!initialLoadDoneRef.current) {
          setErrorMessage('Falha ao carregar a conversa.');
          setLoading(false);
          initialLoadDoneRef.current = true;
        }
      }
    };

    void lookup();
    return () => {
      cancelled = true;
    };
  }, [conversationId, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);
  const applyUpdate = useCallback((updated: ConversationSummary) => setConversation(updated), []);

  // Tempo real (N2-4): o status da conversa (bot/human) também acompanha ao
  // vivo — se outro atendente assumir/devolver, o cabeçalho reflete sem F5.
  usePollingRefresh(refresh);

  return { conversation, loading, errorMessage, refresh, applyUpdate };
}
