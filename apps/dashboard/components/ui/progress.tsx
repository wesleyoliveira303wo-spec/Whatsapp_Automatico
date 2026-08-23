import * as React from 'react';

import { cn } from '@/lib/utils';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100. Valores fora do intervalo são grampeados (nunca estoura a barra visualmente). */
  value: number;
}

/**
 * Barra de progresso — mesmo padrão dos demais primitivos `ui/` (sem
 * dependência do Radix Progress: só duas `<div>`s + Tailwind, mesma
 * disciplina de preferir solução nativa quando ela resolve o problema).
 * Reorganização Contatos/Campanhas (2026-08-17) — primeiro consumidor:
 * progresso de envio no dashboard por campanha.
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, value));
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
        {...props}
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
    );
  },
);
Progress.displayName = 'Progress';

export { Progress };
