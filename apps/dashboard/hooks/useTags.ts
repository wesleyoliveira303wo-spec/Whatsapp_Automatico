import { useCallback, useEffect, useState } from 'react';
import { createTag, deleteTag, fetchTags, updateTag } from '../lib/clientApi';
import type { Tag, TagColor } from '../lib/clientApi';

export interface UseTagsResult {
  tags: Tag[];
  loading: boolean;
  errorMessage: string | null;
  refresh: () => void;
  create: (name: string, color: TagColor) => Promise<Tag>;
  update: (id: string, data: { name?: string; color?: TagColor }) => Promise<Tag>;
  remove: (id: string) => Promise<void>;
}

/**
 * Catálogo de tags de UMA sessão (Redesign 2026-08-05, R4) — mesmo espírito
 * de `useQuickReplies`: compartilhado entre a tela de gestão (aba "Tags" em
 * Configurações, CRUD completo) e o seletor de atribuição no painel de
 * contexto da conversa (só leitura). Busca uma vez por `sessionName` e
 * atualiza a lista local otimisticamente após create/update/remove.
 */
export function useTags(sessionName: string | null): UseTagsResult {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!sessionName) return;
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetchTags(sessionName)
      .then(({ tags: fetched }) => {
        if (!cancelled) setTags(fetched);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Falha ao carregar as tags.');
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
    async (name: string, color: TagColor): Promise<Tag> => {
      if (!sessionName) throw new Error('sessionName ausente');
      const { tag } = await createTag(sessionName, name, color);
      setTags((current) => [...current, tag]);
      return tag;
    },
    [sessionName],
  );

  const update = useCallback(
    async (id: string, data: { name?: string; color?: TagColor }): Promise<Tag> => {
      if (!sessionName) throw new Error('sessionName ausente');
      const { tag } = await updateTag(sessionName, id, data);
      setTags((current) => current.map((item) => (item.id === id ? tag : item)));
      return tag;
    },
    [sessionName],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!sessionName) throw new Error('sessionName ausente');
      await deleteTag(sessionName, id);
      setTags((current) => current.filter((item) => item.id !== id));
    },
    [sessionName],
  );

  return { tags, loading, errorMessage, refresh, create, update, remove };
}
