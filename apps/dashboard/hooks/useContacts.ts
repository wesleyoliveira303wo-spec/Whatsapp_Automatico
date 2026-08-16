import { useCallback, useEffect, useState } from 'react';
import { fetchContacts, importContacts } from '../lib/clientApi';
import type { Contact, ContactImportReport } from '../lib/clientApi';

export interface UseContactsResult {
  contacts: Contact[];
  loading: boolean;
  errorMessage: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  search: string;
  setSearch: (value: string) => void;
  refresh: () => void;
  importCsv: (csvText: string) => Promise<ContactImportReport>;
}

const PAGE_SIZE = 20;

/**
 * Base de leads (Fase L, Bloco L1b) — tela "Leads". Paginação por cursor
 * (mesmo padrão de `useConversationsList`), com busca por nome/telefone
 * refazendo a listagem do zero (não é filtro client-side sobre o já
 * carregado — a base pode ter mais leads do que uma página).
 */
export function useContacts(): UseContactsResult {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetchContacts({ limit: PAGE_SIZE, search: search || undefined })
      .then((page) => {
        if (cancelled) return;
        setContacts(page.contacts);
        setCursor(page.nextCursor);
        setHasMore(Boolean(page.nextCursor));
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Falha ao carregar os leads.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, refreshToken]);

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    fetchContacts({ limit: PAGE_SIZE, cursor, search: search || undefined })
      .then((page) => {
        setContacts((current) => [...current, ...page.contacts]);
        setCursor(page.nextCursor);
        setHasMore(Boolean(page.nextCursor));
      })
      .catch(() => setErrorMessage('Falha ao carregar mais leads.'))
      .finally(() => setLoadingMore(false));
  }, [cursor, loadingMore, search]);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  const importCsv = useCallback(
    async (csvText: string): Promise<ContactImportReport> => {
      const report = await importContacts(csvText);
      // Reimportar pode ter criado/enriquecido leads — a lista precisa
      // refletir isso, sempre da primeira página (cursor pode ter mudado).
      refresh();
      return report;
    },
    [refresh],
  );

  return {
    contacts,
    loading,
    errorMessage,
    hasMore,
    loadingMore,
    loadMore,
    search,
    setSearch,
    refresh,
    importCsv,
  };
}
