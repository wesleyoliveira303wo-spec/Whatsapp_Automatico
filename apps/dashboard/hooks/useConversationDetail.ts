import { useCallback, useEffect, useRef, useState } from 'react';
import { ClientApiError, fetchConversation } from '../lib/clientApi';
import { usePollingRefresh } from './usePollingRefresh';
import type { ConversationSummary } from '../lib/clientApi';

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
 * Detalhe de uma conversa (Milestone 3, Bloco 6; endpoint dedicado desde a
 * Fase 1, Bloco F1.10 — estabilidade para beta).
 *
 * ATÉ O BLOCO F1.10: o backend não expunha `GET /conversations/:id`, então
 * este hook varria `GET /conversations?limit=200` página a página (até 5
 * páginas = 1000 conversas) só para achar UMA por id — rodando a cada poll
 * de 4s, em dobro (painel central + painel de contexto montam o hook cada
 * um). A auditoria pré-beta identificou isso como o gargalo mais concreto
 * de performance do produto. `fetchConversation(id)` busca direto pela
 * chave primária (`ConversationsService.getConversation`, com isolamento de
 * tenant garantido no backend) — sem varredura, sem teto de "1000 conversas
 * mais recentes".
 *
 * Sem SSE aqui (D23: SSE so na lista): o status exibido e atualizado (a)
 * pelas respostas das proprias acoes escalate/resume (`applyUpdate`) e (b)
 * por `refresh()` manual/polling.
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
        const found = await fetchConversation(conversationId);
        if (cancelled) return;
        setConversation(found);
        setErrorMessage(null);
        setLoading(false);
        initialLoadDoneRef.current = true;
      } catch (error) {
        if (cancelled) return;
        // Mesmo racional de antes: erro num poll não derruba a conversa já
        // carregada — só reflete na tela (não encontrada/falha) na 1ª carga.
        if (!initialLoadDoneRef.current) {
          const notFound = error instanceof ClientApiError && error.status === 404;
          setConversation(null);
          setErrorMessage(notFound ? 'Conversa nao encontrada.' : 'Falha ao carregar a conversa.');
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
