import { useCallback, useEffect, useState } from 'react';
import { fetchUnansweredQuestions } from '../lib/clientApi';
import type { UnansweredQuestionSummary } from '../lib/clientApi';

export interface UseUnansweredQuestionsResult {
  questions: UnansweredQuestionSummary[];
  loading: boolean;
  errorMessage: string | null;
  refresh: () => void;
}

/**
 * Lacunas de conhecimento da IA de UMA sessão (Bloco B3, issue #14) —
 * perguntas em que a IA sinalizou "não sei responder" (Fase 1, Bloco
 * F1.4/ADR #95). Mesmo padrão de `useAiFaqEntries`: busca uma vez por
 * `sessionName`, com `refresh()` manual.
 *
 * Sem polling de propósito: uma lacuna nova não é um evento que o operador
 * precise ver no segundo em que acontece (diferente de "aguardando
 * atendente", que tem `usePollingRefresh`) — e evita uma consulta que cruza
 * três tabelas rodando de fundo o tempo todo.
 */
export function useUnansweredQuestions(sessionName: string | null): UseUnansweredQuestionsResult {
  const [questions, setQuestions] = useState<UnansweredQuestionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!sessionName) return;
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetchUnansweredQuestions(sessionName)
      .then(({ questions: fetched }) => {
        if (!cancelled) setQuestions(fetched);
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Falha ao carregar as perguntas que a IA não soube responder.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionName, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  return { questions, loading, errorMessage, refresh };
}
