import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Milestone 6, Bloco M6D-1 (ADR #64) — primitivo `Skeleton`, padrão
 * shadcn/ui: sem forma própria, é o consumidor que dá o formato via
 * `className` (ex.: `<Skeleton className="h-4 w-32" />` para uma linha de
 * texto, `<Skeleton className="h-10 w-10 rounded-full" />` para um avatar).
 * `animate-pulse` é utilitário nativo do Tailwind (não precisa de
 * `tailwindcss-animate`). Layouts de skeleton ESPECÍFICOS de cada tela (ex.:
 * "3 linhas no formato de `SessionListItem`") são construídos no retrofit
 * (M6E+), não aqui — este componente só existe pra provar o contrato de
 * "Carregando" do §7 do `DESIGN_SYSTEM.md`.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export { Skeleton };
