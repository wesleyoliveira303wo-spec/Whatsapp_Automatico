import { formatAiInteractionStatusLabel, aiInteractionStatusBadgeClassName } from '@/lib/formatters';
import type { AiInteractionStatus } from '@/lib/clientApi';

interface AiInteractionStatusBadgeProps {
  status: AiInteractionStatus;
}

/** Badge de status de uma `AiInteraction` (Milestone 3, Bloco 6 — D28). Logica de rotulo/cor em `lib/formatters.ts` (testavel); este componente so renderiza. */
export default function AiInteractionStatusBadge({ status }: AiInteractionStatusBadgeProps): JSX.Element {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${aiInteractionStatusBadgeClassName(status)}`}>
      {formatAiInteractionStatusLabel(status)}
    </span>
  );
}
