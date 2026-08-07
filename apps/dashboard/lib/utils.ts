import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Helper padrão do shadcn/ui (Milestone 6, Bloco M6A — ADR #62) — combina
 * `clsx` (classes condicionais: `cn('a', condicao && 'b')`) com `tailwind-merge`
 * (resolve conflitos entre classes Tailwind do MESMO grupo, ex.: `cn('p-2',
 * 'p-4')` vira `'p-4'`, não os dois juntos). Necessário sempre que um
 * componente aceita `className` como prop e precisa MESCLAR com as classes
 * internas dele sem duplicar/conflitar utilitários.
 *
 * Usado por todo componente em `components/ui/` (primitivos shadcn/ui) — é a
 * mesma função que o CLI do shadcn gera; mantida aqui manualmente porque a
 * instalação deste bloco não roda o CLI interativo (ver ADR #62).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
