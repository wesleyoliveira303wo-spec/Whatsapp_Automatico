import { useEffect, useMemo, useState } from 'react';

/** Seis por página: o mesmo número nas duas abas, calibrado para a tabela caber sem rolagem num notebook. */
export const BROADCAST_PAGE_SIZE = 6;

interface ListControlsConfig<T, F extends string, S extends string> {
  rows: T[];
  /** Texto onde a busca procura (nome do disparo, normalmente). */
  searchText: (row: T) => string;
  matchesFilter: (row: T, filter: F) => boolean;
  compare: (a: T, b: T, sort: S) => number;
  initialFilter: F;
  initialSort: S;
}

interface ListControls<T, F extends string, S extends string> {
  search: string;
  setSearch: (value: string) => void;
  filter: F;
  setFilter: (value: F) => void;
  sort: S;
  setSort: (value: S) => void;
  page: number;
  setPage: (page: number) => void;
  /** Linhas depois de busca + filtro + ordenação (todas as páginas). */
  filteredRows: T[];
  /** O recorte visível da página atual. */
  pagedRows: T[];
  pageCount: number;
}

/**
 * Busca, filtro, ordenação e paginação de uma lista de disparos — Revisão de
 * Disparos (2026-09-12).
 *
 * Por que um hook, e não o mesmo código em cada painel: a aba "Para contatos"
 * tinha os quatro comportamentos e a de "Para grupos" nenhum, porque nasceram
 * em momentos diferentes. Com a mecânica aqui, uma aba nova ganha tudo ao
 * declarar três funções (onde buscar, como filtrar, como comparar) — e uma
 * correção conserta as duas de uma vez.
 *
 * A página volta para 1 sempre que busca, filtro ou ordenação mudam: sem isso,
 * filtrar estando na página 4 mostra uma tela vazia que parece "não achei
 * nada".
 */
export function useBroadcastListControls<T, F extends string, S extends string>({
  rows,
  searchText,
  matchesFilter,
  compare,
  initialFilter,
  initialSort,
}: ListControlsConfig<T, F, S>): ListControls<T, F, S> {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<F>(initialFilter);
  const [sort, setSort] = useState<S>(initialSort);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, filter, sort]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((row) => (term ? searchText(row).toLowerCase().includes(term) : true))
      .filter((row) => matchesFilter(row, filter))
      .sort((a, b) => compare(a, b, sort));
    // `searchText`/`matchesFilter`/`compare` são estáveis por definição (funções
    // puras declaradas no painel); incluí-las aqui recalcularia a lista a cada
    // render sem nenhum ganho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, filter, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / BROADCAST_PAGE_SIZE));
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * BROADCAST_PAGE_SIZE, page * BROADCAST_PAGE_SIZE),
    [filteredRows, page],
  );

  return {
    search,
    setSearch,
    filter,
    setFilter,
    sort,
    setSort,
    page,
    setPage,
    filteredRows,
    pagedRows,
    pageCount,
  };
}
