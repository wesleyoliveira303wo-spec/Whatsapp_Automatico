import { useCallback, useEffect, useState } from 'react';
import {
  createQuickReply,
  deleteQuickReply,
  fetchQuickReplies,
  updateQuickReply,
} from '../lib/clientApi';
import type { QuickReply } from '../lib/clientApi';

export interface UseQuickRepliesResult {
  quickReplies: QuickReply[];
  loading: boolean;
  errorMessage: string | null;
  refresh: () => void;
  create: (content: string) => Promise<QuickReply>;
  update: (id: string, content: string) => Promise<QuickReply>;
  remove: (id: string) => Promise<void>;
}

/**
 * Respostas rápidas de UMA sessão (Fase 1, Bloco F1.9). Compartilhado entre
 * a tela de gestão (`pages/sessions/[sessionName]/quick-replies.tsx`, CRUD
 * completo) e o seletor do `MessageComposer` (só leitura/inserção) — busca
 * uma vez por `sessionName` e atualiza a lista local otimisticamente após
 * create/update/remove, sem precisar rebuscar (mesmo espírito de
 * `applyUpdate` em `useConversationDetail`).
 */
export function useQuickReplies(sessionName: string | null): UseQuickRepliesResult {
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!sessionName) return;
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetchQuickReplies(sessionName)
      .then(({ quickReplies: fetched }) => {
        if (!cancelled) setQuickReplies(fetched);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Falha ao carregar as respostas rápidas.');
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
    async (content: string): Promise<QuickReply> => {
      if (!sessionName) throw new Error('sessionName ausente');
      const { quickReply } = await createQuickReply(sessionName, content);
      setQuickReplies((current) => [...current, quickReply]);
      return quickReply;
    },
    [sessionName],
  );

  const update = useCallback(
    async (id: string, content: string): Promise<QuickReply> => {
      if (!sessionName) throw new Error('sessionName ausente');
      const { quickReply } = await updateQuickReply(sessionName, id, content);
      setQuickReplies((current) => current.map((item) => (item.id === id ? quickReply : item)));
      return quickReply;
    },
    [sessionName],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!sessionName) throw new Error('sessionName ausente');
      await deleteQuickReply(sessionName, id);
      setQuickReplies((current) => current.filter((item) => item.id !== id));
    },
    [sessionName],
  );

  return { quickReplies, loading, errorMessage, refresh, create, update, remove };
}
