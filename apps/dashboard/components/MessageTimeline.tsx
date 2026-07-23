import MessageBubble from './MessageBubble';
import type { ConversationMessage, AiInteractionSummary } from '@/lib/clientApi';

interface MessageTimelineProps {
  messages: ConversationMessage[] | null;
  interactions: AiInteractionSummary[] | null;
  errorMessage: string | null;
  onRetry: () => void;
}

/**
 * Timeline de mensagens (Milestone 3, Bloco 6 — D23/D26/D27). A correlacao
 * Message <-> AiInteraction e feita AQUI, por `messageId`, sobre a lista ja
 * buscada uma unica vez (D27) — um Map por render, O(n), lista limitada a
 * MAX_LIMIT=200 pela API. Limitacao documentada (D26): a timeline NAO marca
 * o ponto de escalonamento — nao existe historico de transicoes de status
 * no backend (sem `ConversationStatusEvent` neste bloco, decisao aprovada);
 * o status ATUAL aparece so no cabecalho da pagina.
 */
export default function MessageTimeline({ messages, interactions, errorMessage, onRetry }: MessageTimelineProps): JSX.Element {
  if (errorMessage) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-red-600">{errorMessage}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (messages === null) {
    return <p className="text-sm text-gray-500">Carregando mensagens…</p>;
  }

  if (messages.length === 0) {
    return <p className="text-sm text-gray-500">Nenhuma mensagem nesta conversa ainda.</p>;
  }

  const interactionByMessageId = new Map<string, AiInteractionSummary>();
  for (const interaction of interactions ?? []) {
    if (interaction.messageId) {
      interactionByMessageId.set(interaction.messageId, interaction);
    }
  }

  return (
    <ul className="flex flex-col gap-2">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} aiInteraction={interactionByMessageId.get(message.id)} />
      ))}
    </ul>
  );
}
