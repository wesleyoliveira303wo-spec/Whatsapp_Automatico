import type { ReactNode } from 'react';

import { useHidesAi } from '@/contexts/PlanContext';

/**
 * Mostra o conteúdo só quando o plano inclui IA — ou seja, esconde no plano
 * Disparos (B5, 2026-09-18). Para telas cujo componente de página fica FORA
 * do `PlanProvider` (ele é montado pelo `SessionLayout`, que a página
 * renderiza): este wrapper vive dentro da árvore do layout, então enxerga o
 * plano. Componentes internos leem `useHidesAi()` direto.
 */
export default function AiOnly({ children }: { children: ReactNode }): JSX.Element | null {
  return useHidesAi() ? null : <>{children}</>;
}
