interface LoadMoreButtonProps {
  onClick: () => void;
  loading: boolean;
  hasMore: boolean;
}

/**
 * Botao "Carregar mais" (Milestone 3, Bloco 6 — D24: paginacao por botao,
 * decisao aprovada — sem infinite scroll, sem paginacao numerada).
 * Reutilizavel por qualquer lista paginada por cursor futura. Renderiza
 * nada quando nao ha proxima pagina — um botao desabilitado permanente
 * seria ruido visual sem informacao.
 */
export default function LoadMoreButton({ onClick, loading, hasMore }: LoadMoreButtonProps): JSX.Element | null {
  if (!hasMore) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="self-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? 'Carregando…' : 'Carregar mais'}
    </button>
  );
}
