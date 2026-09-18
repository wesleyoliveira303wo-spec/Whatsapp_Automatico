import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Seis por página: o mesmo número nas duas abas, calibrado para a tabela caber sem rolagem num notebook. */
export const BROADCAST_PAGE_SIZE = 6;

/**
 * Nomes dos parâmetros na barra de endereço. Curtos de propósito — a URL é
 * lida por pessoas quando alguém manda o link. `tab` NÃO está aqui: quem
 * manda nele é a própria página (`?tab=contacts|groups`), e estes parâmetros
 * convivem com ele sem se atropelarem.
 */
const PARAM = { search: 'q', filter: 'status', sort: 'sort', page: 'page' } as const;

interface ListControlsConfig<T, F extends string, S extends string> {
  rows: T[];
  /** Texto onde a busca procura (nome do disparo, normalmente). */
  searchText: (row: T) => string;
  matchesFilter: (row: T, filter: F) => boolean;
  compare: (a: T, b: T, sort: S) => number;
  initialFilter: F;
  initialSort: S;
  /**
   * Valores aceitos para filtro e ordenação. Servem para validar o que vem da
   * URL: qualquer pessoa pode digitar `?status=banana`, e um valor inválido
   * precisa cair no padrão em vez de esvaziar a lista sem explicação.
   */
  filterOptions: readonly F[];
  sortOptions: readonly S[];
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

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pickOption<V extends string>(
  raw: string | undefined,
  options: readonly V[],
): V | undefined {
  return options.find((option) => option === raw);
}

/**
 * Busca, filtro, ordenação e paginação de uma lista de disparos — Revisão de
 * Disparos (2026-09-12), com o estado na URL desde 2026-09-17.
 *
 * Por que um hook, e não o mesmo código em cada painel: a aba "Para contatos"
 * tinha os quatro comportamentos e a de "Para grupos" nenhum, porque nasceram
 * em momentos diferentes. Com a mecânica aqui, uma aba nova ganha tudo ao
 * declarar três funções (onde buscar, como filtrar, como comparar) — e uma
 * correção conserta as duas de uma vez.
 *
 * ESTADO NA URL (regra 8 de `.claude/rules/ui-telas-de-listagem.md`, pendência
 * registrada na própria revisão). Antes, busca/filtro/página viviam só em
 * memória: não dava para mandar a alguém um link já filtrado, e um F5 perdia
 * a escolha. Agora cada um tem seu parâmetro, e só aparece na barra de
 * endereço quando sai do padrão — a URL de uma tela intocada continua limpa.
 *
 * A troca de endereço é `replace` raso: não recarrega dados nem empilha uma
 * entrada no histórico a cada letra digitada (o "voltar" do navegador sairia
 * da tela letra por letra).
 *
 * A página volta para 1 sempre que busca, filtro ou ordenação mudam — sem
 * isso, filtrar estando na página 4 mostra uma tela vazia que parece "não
 * achei nada". Isso é feito nos próprios setters, e não num efeito sobre o
 * valor: um efeito também dispararia ao ler a URL na abertura, e um link
 * compartilhado apontando para a página 3 cairia na 1.
 */
export function useBroadcastListControls<T, F extends string, S extends string>({
  rows,
  searchText,
  matchesFilter,
  compare,
  initialFilter,
  initialSort,
  filterOptions,
  sortOptions,
}: ListControlsConfig<T, F, S>): ListControls<T, F, S> {
  const router = useRouter();
  const [search, setSearchState] = useState('');
  const [filter, setFilterState] = useState<F>(initialFilter);
  const [sort, setSortState] = useState<S>(initialSort);
  const [page, setPageState] = useState(1);

  // Lê a URL uma única vez, assim que o router souber os parâmetros. Antes de
  // `isReady`, `router.query` vem vazio numa página estática — hidratar cedo
  // demais descartaria em silêncio o link que a pessoa abriu.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!router.isReady || hydrated.current) return;
    hydrated.current = true;

    const query = router.query;
    setSearchState(readParam(query[PARAM.search]) ?? '');
    setFilterState(pickOption(readParam(query[PARAM.filter]), filterOptions) ?? initialFilter);
    setSortState(pickOption(readParam(query[PARAM.sort]), sortOptions) ?? initialSort);
    const rawPage = Number(readParam(query[PARAM.page]));
    setPageState(Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1);
    // Só depende de `isReady`: as demais entradas são estáveis por construção
    // e relê-las reabriria a hidratação a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Escreve de volta. Guarda a última URL escrita para não chamar `replace`
  // com um endereço idêntico ao atual (laço de render).
  const lastWritten = useRef<string | null>(null);
  useEffect(() => {
    if (!router.isReady || !hydrated.current) return;

    const query: Record<string, string | string[] | undefined> = { ...router.query };
    const apply = (key: string, value: string | undefined): void => {
      if (value === undefined) delete query[key];
      else query[key] = value;
    };
    apply(PARAM.search, search.trim() || undefined);
    apply(PARAM.filter, filter === initialFilter ? undefined : filter);
    apply(PARAM.sort, sort === initialSort ? undefined : sort);
    apply(PARAM.page, page > 1 ? String(page) : undefined);

    const signature = JSON.stringify(query);
    if (signature === lastWritten.current) return;
    lastWritten.current = signature;
    void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    // `router` muda de identidade a cada navegação; depender dele reexecutaria
    // este efeito sem nenhum valor novo para escrever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filter, sort, page, router.isReady]);

  // Mudar busca, filtro ou ordenação sempre devolve a pessoa à primeira página.
  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPageState(1);
  }, []);
  const setFilter = useCallback((value: F) => {
    setFilterState(value);
    setPageState(1);
  }, []);
  const setSort = useCallback((value: S) => {
    setSortState(value);
    setPageState(1);
  }, []);

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
  // Um link pode apontar para uma página que não existe mais (o disparo foi
  // excluído, ou a lista encolheu): mostra a última em vez de uma tela vazia.
  const currentPage = Math.min(page, pageCount);
  const pagedRows = useMemo(
    () =>
      filteredRows.slice(
        (currentPage - 1) * BROADCAST_PAGE_SIZE,
        currentPage * BROADCAST_PAGE_SIZE,
      ),
    [filteredRows, currentPage],
  );

  return {
    search,
    setSearch,
    filter,
    setFilter,
    sort,
    setSort,
    page: currentPage,
    setPage: setPageState,
    filteredRows,
    pagedRows,
    pageCount,
  };
}
