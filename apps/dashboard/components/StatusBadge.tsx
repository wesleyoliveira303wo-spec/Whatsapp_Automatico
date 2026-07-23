import { formatStatusLabel, statusBadgeClassName } from '@/lib/formatters';
import type { WhatsAppSessionStatus } from '@/lib/clientApi';

interface StatusBadgeProps {
  status: WhatsAppSessionStatus;
}

/** Badge colorido de status (M2, Fase 4 — UI-1/UI-2). Toda a lógica de rótulo/cor vive em `lib/formatters.ts` (testável) — este componente só renderiza. */
export default function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClassName(status)}`}>
      {formatStatusLabel(status)}
    </span>
  );
}
