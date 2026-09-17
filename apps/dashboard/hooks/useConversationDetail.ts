import { ClientApiError, fetchConversation } from '../lib/clientApi';
import { useSharedPoll } from './useSharedPoll';
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
  // Compartilhado por chave (2026-09-17): o painel central e o painel de
  // contexto montam este hook para a MESMA conversa — antes eram dois polls
  // independentes a cada 4s, agora é um só (ver `useSharedPoll`). Bônus:
  // `applyUpdate` num painel reflete no outro na hora.
  const { data, error, settled, refresh, setData } = useSharedPoll<ConversationSummary>(
    conversationId ? `conversation:${conversationId}` : null,
    () => fetchConversation(conversationId as string),
  );

  // Mesmo racional de antes: erro num poll não derruba a conversa já
  // carregada — só vira mensagem na tela quando nunca houve dado bom.
  let errorMessage: string | null = null;
  if (settled && data === undefined && error !== undefined) {
    const notFound = error instanceof ClientApiError && error.status === 404;
    errorMessage = notFound ? 'Conversa nao encontrada.' : 'Falha ao carregar a conversa.';
  }

  return {
    conversation: data ?? null,
    loading: !settled,
    errorMessage,
    refresh,
    applyUpdate: setData,
  };
}
