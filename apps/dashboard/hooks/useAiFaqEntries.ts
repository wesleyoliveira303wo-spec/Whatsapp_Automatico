import { useCallback, useEffect, useState } from 'react';
import {
  createAiFaqEntry,
  deleteAiFaqEntry,
  fetchAiFaqEntries,
  updateAiFaqEntry,
} from '../lib/clientApi';
import type { AiFaqEntry } from '../lib/clientApi';

export interface UseAiFaqEntriesResult {
  faqEntries: AiFaqEntry[];
  loading: boolean;
  errorMessage: string | null;
  refresh: () => void;
  create: (question: string, answer: string, category: string | null) => Promise<AiFaqEntry>;
  update: (
    id: string,
    input: Partial<Pick<AiFaqEntry, 'question' | 'answer' | 'category' | 'active'>>,
  ) => Promise<AiFaqEntry>;
  remove: (id: string) => Promise<void>;
}

/**
 * FAQ estruturada de UMA sessão (Cérebro da IA v3, Fase 2, 2026-08-25).
 * Mesmo padrão de `useQuickReplies`: busca uma vez por `sessionName` e
 * atualiza a lista local otimisticamente após create/update/remove.
 */
export function useAiFaqEntries(sessionName: string | null): UseAiFaqEntriesResult {
  const [faqEntries, setFaqEntries] = useState<AiFaqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!sessionName) return;
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetchAiFaqEntries(sessionName)
      .then(({ faqEntries: fetched }) => {
        if (!cancelled) setFaqEntries(fetched);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Falha ao carregar as perguntas frequentes.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionName, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  const create = useCallback(
    async (question: string, answer: string, category: string | null): Promise<AiFaqEntry> => {
      if (!sessionName) throw new Error('sessionName ausente');
      const { faqEntry } = await createAiFaqEntry(sessionName, question, answer, category);
      setFaqEntries((current) => [...current, faqEntry]);
      return faqEntry;
    },
    [sessionName],
  );

  const update = useCallback(
    async (
      id: string,
      input: Partial<Pick<AiFaqEntry, 'question' | 'answer' | 'category' | 'active'>>,
    ): Promise<AiFaqEntry> => {
      if (!sessionName) throw new Error('sessionName ausente');
      const { faqEntry } = await updateAiFaqEntry(sessionName, id, input);
      setFaqEntries((current) => current.map((item) => (item.id === id ? faqEntry : item)));
      return faqEntry;
    },
    [sessionName],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!sessionName) throw new Error('sessionName ausente');
      await deleteAiFaqEntry(sessionName, id);
      setFaqEntries((current) => current.filter((item) => item.id !== id));
    },
    [sessionName],
  );

  return { faqEntries, loading, errorMessage, refresh, create, update, remove };
}
