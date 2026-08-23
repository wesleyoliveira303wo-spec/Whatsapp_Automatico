import { useCallback, useEffect, useState } from 'react';
import {
  fetchContacts,
  fetchContactStats,
  importContacts,
  optOutContact,
  optInContact,
  createContact,
  updateContact,
  deleteContact,
} from '../lib/clientApi';
import type {
  Contact,
  ContactImportReport,
  ContactStats,
  ContactStatusFilter,
} from '../lib/clientApi';

export interface UseContactsResult {
  contacts: Contact[];
  /** Contagens da base inteira (não da página) — `null` enquanto carrega. */
  stats: ContactStats | null;
  loading: boolean;
  errorMessage: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  search: string;
  setSearch: (value: string) => void;
  /** Aditivo (2026-08-17) — aba ativa (Todos/Com conversa/Sem conversa/Opt-outs). `undefined` = Todos. */
  status: ContactStatusFilter | undefined;
  setStatus: (value: ContactStatusFilter | undefined) => void;
  refresh: () => void;
  importCsv: (csvText: string) => Promise<ContactImportReport>;
  /** Fase L, Bloco L2 — atualiza a linha LOCALMENTE com o contato devolvido pela API, sem refazer a listagem inteira. */
  optOut: (contactId: string) => Promise<void>;
  optIn: (contactId: string) => Promise<void>;
  /** Reorganização Contatos/Campanhas (2026-08-17) — CRUD manual. */
  create: (input: { phone: string; name?: string }) => Promise<{ wasCreated: boolean }>;
  update: (contactId: string, input: { name?: string; phone?: string }) => Promise<void>;
  remove: (contactId: string) => Promise<void>;
}

const PAGE_SIZE = 20;

/**
 * Base de contatos (Fase L, Bloco L1b) — tela "Contatos". Paginação por
 * cursor (mesmo padrão de `useConversationsList`), com busca por
 * nome/telefone refazendo a listagem do zero (não é filtro client-side
 * sobre o já carregado — a base pode ter mais contatos do que uma página).
 */
export function useContacts(): UseContactsResult {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContactStatusFilter | undefined>(undefined);
  const [refreshToken, setRefreshToken] = useState(0);
  const [stats, setStats] = useState<ContactStats | null>(null);

  // Contagens da base — recarregadas só quando algo pode ter MUDADO a base
  // (`refreshToken`), nunca ao digitar na busca: elas descrevem o total, não
  // a página filtrada. Falha em silêncio (os cards somem) — os cards são
  // informativos, não podem derrubar a lista.
  useEffect(() => {
    let cancelled = false;
    fetchContactStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetchContacts({ limit: PAGE_SIZE, search: search || undefined, status })
      .then((page) => {
        if (cancelled) return;
        setContacts(page.contacts);
        setCursor(page.nextCursor);
        setHasMore(Boolean(page.nextCursor));
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Falha ao carregar os contatos.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, status, refreshToken]);

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    fetchContacts({ limit: PAGE_SIZE, cursor, search: search || undefined, status })
      .then((page) => {
        setContacts((current) => [...current, ...page.contacts]);
        setCursor(page.nextCursor);
        setHasMore(Boolean(page.nextCursor));
      })
      .catch(() => setErrorMessage('Falha ao carregar mais contatos.'))
      .finally(() => setLoadingMore(false));
  }, [cursor, loadingMore, search, status]);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  const importCsv = useCallback(
    async (csvText: string): Promise<ContactImportReport> => {
      const report = await importContacts(csvText);
      // Reimportar pode ter criado/enriquecido contatos — a lista precisa
      // refletir isso, sempre da primeira página (cursor pode ter mudado).
      refresh();
      return report;
    },
    [refresh],
  );

  const optOut = useCallback(async (contactId: string): Promise<void> => {
    const { contact } = await optOutContact(contactId);
    setContacts((current) => current.map((item) => (item.id === contact.id ? contact : item)));
  }, []);

  const optIn = useCallback(async (contactId: string): Promise<void> => {
    const { contact } = await optInContact(contactId);
    setContacts((current) => current.map((item) => (item.id === contact.id ? contact : item)));
  }, []);

  const create = useCallback(
    async (input: { phone: string; name?: string }): Promise<{ wasCreated: boolean }> => {
      const { wasCreated } = await createContact(input);
      refresh();
      return { wasCreated };
    },
    [refresh],
  );

  const update = useCallback(
    async (contactId: string, input: { name?: string; phone?: string }): Promise<void> => {
      const { contact } = await updateContact(contactId, input);
      setContacts((current) => current.map((item) => (item.id === contact.id ? contact : item)));
    },
    [],
  );

  const remove = useCallback(
    async (contactId: string): Promise<void> => {
      await deleteContact(contactId);
      setContacts((current) => current.filter((item) => item.id !== contactId));
      refresh();
    },
    [refresh],
  );

  return {
    contacts,
    stats,
    loading,
    errorMessage,
    hasMore,
    loadingMore,
    loadMore,
    search,
    setSearch,
    status,
    setStatus,
    refresh,
    importCsv,
    optOut,
    optIn,
    create,
    update,
    remove,
  };
}
