import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatStatusLabel, statusBadgeClassName } from '@/lib/formatters';
import type { WhatsAppSessionStatus } from '@/lib/clientApi';

interface StatusBadgeProps {
  status: WhatsAppSessionStatus;
}

/**
 * Badge colorido de status (M2, Fase 4 — UI-1/UI-2). Toda a lógica de
 * rótulo/cor vive em `lib/formatters.ts` (testável) — este componente só
 * renderiza. A partir do Bloco M6C-4, compõe o primitivo `Badge`
 * (`components/ui/badge.tsx`) por baixo: `variant="outline"` fornece só a
 * estrutura (pílula, tamanho de fonte, foco), sem impor cor — a cor/padding
 * vêm de `statusBadgeClassName` e sobrescrevem por `cn()` (tailwind-merge),
 * preservando a aparência EXATA de antes (mesma paleta ad-hoc por status,
 * sem a variante `success`/`warning`/`destructive` do Design System ainda —
 * essa migração semântica fica para o retrofit, M6E+).
 */
export default function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  return (
    <Badge
      variant="outline"
      className={cn('border-transparent px-3 py-1 font-semibold', statusBadgeClassName(status))}
    >
      {formatStatusLabel(status)}
    </Badge>
  );
}
