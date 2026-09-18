/**
 * `useBroadcastListControls` — a mecânica de busca/filtro/ordenação/paginação
 * compartilhada pelas duas abas de Disparos, com o estado na URL desde
 * 2026-09-17 (regra 8 de `.claude/rules/ui-telas-de-listagem.md`).
 *
 * O que estes testes protegem, em ordem de importância: um link compartilhado
 * abre exatamente a lista que a outra pessoa estava vendo; um valor inválido
 * na URL nunca esvazia a tela; e a URL de uma tela intocada continua limpa.
 */
import { renderHook, act, RenderHookResult } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useBroadcastListControls } from '../../hooks/useBroadcastListControls';

const mockRouterReplace = jest.fn();
let mockRouterQuery: Record<string, string> = {};
let mockRouterReady = true;

jest.mock('next/router', () => ({
  useRouter: () => ({
    query: mockRouterQuery,
    pathname: '/sessions/[sessionName]/campaigns',
    isReady: mockRouterReady,
    replace: mockRouterReplace,
  }),
}));

type Filter = 'all' | 'running' | 'paused';
type Sort = 'recent' | 'name';

interface Row {
  name: string;
  status: 'running' | 'paused';
}

/** Sete linhas: mais que uma página (seis), então a paginação é exercitada de verdade. */
const ROWS: Row[] = [
  { name: 'Alfa', status: 'running' },
  { name: 'Bravo', status: 'paused' },
  { name: 'Charlie', status: 'running' },
  { name: 'Delta', status: 'paused' },
  { name: 'Echo', status: 'running' },
  { name: 'Foxtrot', status: 'paused' },
  { name: 'Golf', status: 'running' },
];

type Controls = ReturnType<typeof useBroadcastListControls<Row, Filter, Sort>>;

function setup(rows: Row[] = ROWS): RenderHookResult<Controls, unknown> {
  return renderHook(() =>
    useBroadcastListControls<Row, Filter, Sort>({
      rows,
      searchText: (row) => row.name,
      matchesFilter: (row, filter) => filter === 'all' || row.status === filter,
      compare: (a, b, sort) => (sort === 'name' ? a.name.localeCompare(b.name) : 0),
      initialFilter: 'all',
      initialSort: 'recent',
      filterOptions: ['all', 'running', 'paused'],
      sortOptions: ['recent', 'name'],
    }),
  );
}

/** A última chamada a `router.replace`, já reduzida ao objeto de query. */
function lastWrittenQuery(): Record<string, unknown> {
  const call = mockRouterReplace.mock.calls.at(-1);
  return (call?.[0] as { query: Record<string, unknown> }).query;
}

beforeEach(() => {
  mockRouterReplace.mockClear();
  mockRouterQuery = {};
  mockRouterReady = true;
});

describe('useBroadcastListControls — estado na URL', () => {
  it('abre com busca, filtro, ordenação e página vindos da URL (link compartilhado)', () => {
    mockRouterQuery = { q: 'alfa', status: 'running', sort: 'name', page: '2' };

    const { result } = setup();

    expect(result.current.search).toBe('alfa');
    expect(result.current.filter).toBe('running');
    expect(result.current.sort).toBe('name');
    // Uma busca por "alfa" tem uma linha só, então a página 2 não existe e o
    // hook mostra a última — nunca uma tela vazia.
    expect(result.current.page).toBe(1);
  });

  it('honra a página da URL quando ela existe de verdade', () => {
    mockRouterQuery = { page: '2' };

    const { result } = setup();

    expect(result.current.page).toBe(2);
    expect(result.current.pagedRows).toHaveLength(1);
  });

  it('valor inválido na URL cai no padrão, em vez de esvaziar a lista', () => {
    mockRouterQuery = { status: 'banana', sort: 'aleatorio', page: '-3' };

    const { result } = setup();

    expect(result.current.filter).toBe('all');
    expect(result.current.sort).toBe('recent');
    expect(result.current.page).toBe(1);
    expect(result.current.filteredRows).toHaveLength(ROWS.length);
  });

  it('escreve na URL o que a pessoa escolheu, sem recarregar nem empilhar histórico', () => {
    const { result } = setup();

    act(() => result.current.setFilter('paused'));

    expect(lastWrittenQuery()).toMatchObject({ status: 'paused' });
    const [, , options] = mockRouterReplace.mock.calls.at(-1) as unknown[];
    expect(options).toEqual({ shallow: true });
  });

  it('tela intocada mantém a URL limpa (nenhum parâmetro de padrão aparece)', () => {
    const { result } = setup();

    act(() => result.current.setFilter('paused'));
    act(() => result.current.setFilter('all'));

    const query = lastWrittenQuery();
    expect(query).not.toHaveProperty('status');
    expect(query).not.toHaveProperty('q');
    expect(query).not.toHaveProperty('page');
  });

  it('preserva parâmetros que não são dele (a aba aberta, por exemplo)', () => {
    mockRouterQuery = { tab: 'groups', sessionName: 'vendas' };

    const { result } = setup();
    act(() => result.current.setSearch('bravo'));

    expect(lastWrittenQuery()).toMatchObject({
      tab: 'groups',
      sessionName: 'vendas',
      q: 'bravo',
    });
  });

  it('não lê a URL enquanto o router não está pronto (não descarta o link)', () => {
    mockRouterReady = false;
    mockRouterQuery = { q: 'alfa' };

    const { result } = setup();

    expect(result.current.search).toBe('');
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('mudar busca, filtro ou ordenação volta para a primeira página', () => {
    mockRouterQuery = { page: '2' };

    const { result } = setup();
    expect(result.current.page).toBe(2);

    act(() => result.current.setSearch('a'));

    expect(result.current.page).toBe(1);
  });
});
