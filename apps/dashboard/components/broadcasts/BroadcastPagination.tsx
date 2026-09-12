import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BroadcastPaginationProps {
  /** Quantos itens estão visíveis nesta página. */
  showing: number;
  /** Quantos itens existem depois de busca e filtro. */
  total: number;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Singular do que está sendo contado, ex.: "disparo". O plural recebe "s". */
  noun: string;
}

/**
 * Rodapé de contagem + páginas — Revisão de Disparos (2026-09-12).
 *
 * A contagem aparece SEMPRE (é ela que diz "estou vendo 6 de 41"); os botões
 * de página só quando há mais de uma. Antes, só a aba de contatos paginava, e
 * a de grupos simplesmente despejava tudo.
 */
export default function BroadcastPagination({
  showing,
  total,
  page,
  pageCount,
  onPageChange,
  noun,
}: BroadcastPaginationProps): JSX.Element {
  return (
    <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted-foreground">
      <span>
        Mostrando {showing} de {total} {noun}
        {total === 1 ? '' : 's'}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page === 1}
            aria-label="Página anterior"
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              aria-current={pageNumber === page ? 'page' : undefined}
              onClick={() => onPageChange(pageNumber)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md text-[12px] font-medium',
                pageNumber === page
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              {pageNumber}
            </button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page === pageCount}
            aria-label="Próxima página"
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
