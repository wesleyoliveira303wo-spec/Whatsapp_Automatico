import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

import type { TenantSignal } from '@/lib/platformClientApi';
import { cn } from '@/lib/utils';

/**
 * Selo de um sinal de atenção — Fase 2 (`ADMIN_PLATFORM_MASTER_PLAN.md` §5.3).
 *
 * REGRA INEGOCIÁVEL: nunca só cor. Sempre ícone + rótulo. A cor reforça, não
 * substitui — quem não distingue vermelho de âmbar lê "Desconectado" /
 * "Nunca começou" do mesmo jeito.
 *
 * O `reading` (uma frase explicando o sinal) vira o `title` — dica ao passar o
 * mouse, sem poluir a tabela.
 */
const SEVERITY_STYLE: Record<TenantSignal['severity'], string> = {
  red: 'border-destructive/40 bg-destructive/10 text-destructive',
  amber: 'border-warning/40 bg-warning/10 text-warning',
  green: 'border-success/40 bg-success/10 text-success',
};

const SEVERITY_ICON: Record<TenantSignal['severity'], typeof AlertCircle> = {
  red: AlertCircle,
  amber: AlertTriangle,
  green: CheckCircle2,
};

export function TenantSignalBadge({
  signal,
  className,
}: {
  signal: TenantSignal;
  className?: string;
}): JSX.Element {
  const Icon = SEVERITY_ICON[signal.severity];
  return (
    <span
      title={signal.reading}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium',
        SEVERITY_STYLE[signal.severity],
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {signal.label}
    </span>
  );
}
