import { Button } from '@/components/ui/button';

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
 *
 * Milestone 6, Bloco M6E-2: retrofit sobre `Button` (variant `outline`).
 */
export default function LoadMoreButton({
  onClick,
  loading,
  hasMore,
}: LoadMoreButtonProps): JSX.Element | null {
  if (!hasMore) {
    return null;
  }
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={loading}
      className="self-center"
    >
      {loading ? 'Carregando…' : 'Carregar mais'}
    </Button>
  );
}
