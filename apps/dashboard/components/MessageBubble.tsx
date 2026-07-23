import { formatDateTime } from '@/lib/formatters';
import type { ConversationMessage, AiInteractionSummary } from '@/lib/clientApi';

interface MessageBubbleProps {
  message: ConversationMessage;
  /** Interacao de IA que GEROU esta mensagem (correlacao por `messageId`, D27) — presente so em outbound geradas pela IA. */
  aiInteraction?: AiInteractionSummary;
}

/**
 * Uma mensagem na timeline (Milestone 3, Bloco 6). Inbound a esquerda
 * (contato), outbound a direita (bot/operador). Outbound correlacionada a
 * uma `AiInteraction` (D27) ganha o selo "Gerada por IA" com o modelo —
 * na ausencia de correlacao, nenhuma inferencia e feita (D26: nada de
 * heuristica; so o que os dados afirmam).
 */
export default function MessageBubble({ message, aiInteraction }: MessageBubbleProps): JSX.Element {
  const outbound = message.direction === 'outbound';
  return (
    <li className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${
          outbound ? 'bg-primary text-white' : 'border border-gray-200 bg-white text-gray-800'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p className={`mt-1 text-xs ${outbound ? 'text-blue-100' : 'text-gray-400'}`}>
          {formatDateTime(message.occurredAt)}
          {aiInteraction && (
            <span className="ml-2 font-medium">· Gerada por IA{aiInteraction.model ? ` (${aiInteraction.model})` : ''}</span>
          )}
        </p>
      </div>
    </li>
  );
}
