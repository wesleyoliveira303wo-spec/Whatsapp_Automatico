import { formatConversationStatusLabel, conversationStatusBadgeClassName } from '@/lib/formatters';
import type { ConversationStatus } from '@/lib/clientApi';

interface ConversationStatusBadgeProps {
  status: ConversationStatus;
}

/**
 * Badge de status de conversa (Milestone 3, Bloco 6). Componente PROPRIO,
 * deliberadamente separado de `StatusBadge` (M2) — aquele e tipado a
 * `WhatsAppSessionStatus`; reaproveita-lo aqui exigiria quebrar o tipo ou
 * um `as any` (risco registrado no levantamento arquitetural do Bloco 6).
 * Toda logica de rotulo/cor vive em `lib/formatters.ts` (testavel) — este
 * componente so renderiza, mesmo padrao de `StatusBadge`.
 */
export default function ConversationStatusBadge({ status }: ConversationStatusBadgeProps): JSX.Element {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${conversationStatusBadgeClassName(status)}`}>
      {formatConversationStatusLabel(status)}
    </span>
  );
}
