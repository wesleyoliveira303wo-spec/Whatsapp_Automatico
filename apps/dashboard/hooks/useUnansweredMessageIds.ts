import { useCallback, useEffect, useState } from 'react';
import { fetchUnansweredQuestions } from '../lib/clientApi';

export interface UseUnansweredMessageIdsResult {
  /** Ids das mensagens que a IA sinalizou não saber responder nesta conversa. */
  messageIds: ReadonlySet<string>;
  refresh: () => void;
}

/**
 * Lacunas de UMA conversa (2026-09-05, pedido do fundador) — o que permite
 * marcar a bolha exata na timeline.
 *
 * Deliberadamente SEM polling: uma lacuna nova aparece junto com a resposta
 * da IA, e o operador está lendo a conversa, não vigiando o marcador — não
 * vale uma consulta que cruza três tabelas a cada poucos segundos. Recarrega
 * ao trocar de conversa e depois de cadastrar uma resposta.
 *
 * Falha silenciosamente: sem lacunas conhecidas, a timeline só não mostra
 * marcador nenhum — nunca um erro na tela por causa de um adorno.
 */
export function useUnansweredMessageIds(
  sessionName: string | undefined,
  conversationId: string | undefined,
): UseUnansweredMessageIdsResult {
  const [messageIds, setMessageIds] = useState<ReadonlySet<string>>(new Set());
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!sessionName || !conversationId) {
      setMessageIds(new Set());
      return;
    }
    let cancelled = false;
    fetchUnansweredQuestions(sessionName, undefined, conversationId)
      .then(({ questions }) => {
        if (cancelled) return;
        const ids = questions
          .map((question) => question.messageId)
          .filter((id): id is string => Boolean(id));
        setMessageIds(new Set(ids));
      })
      .catch(() => {
        if (!cancelled) setMessageIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [sessionName, conversationId, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  return { messageIds, refresh };
}
