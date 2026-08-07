import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  formatAiInteractionStatusLabel,
  aiInteractionStatusBadgeClassName,
} from '@/lib/formatters';
import type { AiInteractionStatus } from '@/lib/clientApi';

interface AiInteractionStatusBadgeProps {
  status: AiInteractionStatus;
}

/**
 * Badge de status de uma `AiInteraction` (Milestone 3, Bloco 6 — D28).
 * Logica de rotulo/cor em `lib/formatters.ts` (testavel); este componente so
 * renderiza. A partir do M6C-4, compõe o primitivo `Badge` por baixo (mesmo
 * racional de `StatusBadge`/`ConversationStatusBadge`).
 */
export default function AiInteractionStatusBadge({
  status,
}: AiInteractionStatusBadgeProps): JSX.Element {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent px-2 py-0.5 font-semibold',
        aiInteractionStatusBadgeClassName(status),
      )}
    >
      {formatAiInteractionStatusLabel(status)}
    </Badge>
  );
}
