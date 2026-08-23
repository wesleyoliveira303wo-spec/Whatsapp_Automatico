import { Fragment } from 'react';
import MessageBubble from './MessageBubble';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import { formatDayDivider, isSameCalendarDay } from '@/lib/formatters';
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
 *
 * Milestone 6, Bloco M6E-2: contrato de 4 estados — `Skeleton` no formato de
 * bolhas de conversa durante o carregamento (em vez de texto "Carregando…"),
 * `ErrorState` com retry no erro.
 *
 * Redesign 2026-08-05 (R3): divisor de data ("Hoje"/"Ontem"/data curta,
 * padrão WhatsApp/Telegram) inserido sempre que o dia muda entre uma
 * mensagem e a anterior (ou antes da primeira) — comparação por
 * `isSameCalendarDay`, puramente derivada de `occurredAt`, sem estado extra.
 */
export default function MessageTimeline({
  messages,
  interactions,
  errorMessage,
  onRetry,
}: MessageTimelineProps): JSX.Element {
  if (errorMessage) {
    return (
      <ErrorState
        title="Não foi possível carregar as mensagens"
        description={errorMessage}
        onRetry={onRetry}
      />
    );
  }

  if (messages === null) {
    return (
      <ul className="flex flex-col gap-2" aria-label="Carregando mensagens">
        <li className="flex justify-start">
          <Skeleton className="h-10 w-2/3 rounded-lg" />
        </li>
        <li className="flex justify-end">
          <Skeleton className="h-10 w-1/2 rounded-lg" />
        </li>
        <li className="flex justify-start">
          <Skeleton className="h-10 w-3/5 rounded-lg" />
        </li>
      </ul>
    );
  }

  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma mensagem nesta conversa ainda.</p>;
  }

  const interactionByMessageId = new Map<string, AiInteractionSummary>();
  for (const interaction of interactions ?? []) {
    if (interaction.messageId) {
      interactionByMessageId.set(interaction.messageId, interaction);
    }
  }

  return (
    <ul className="flex flex-col gap-2">
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const showDivider =
          !previous || !isSameCalendarDay(previous.occurredAt, message.occurredAt);
        return (
          <Fragment key={message.id}>
            {showDivider && (
              <li className="flex justify-center py-1" aria-hidden="true">
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {formatDayDivider(message.occurredAt)}
                </span>
              </li>
            )}
            <MessageBubble
              message={message}
              // CORREÇÃO 2026-08-18: `AiInteraction.messageId` é um campo de
              // DUPLO PROPÓSITO no backend — grava a mensagem INBOUND que
              // originou a geração (Fase 1, F1.4) até o envio outbound ter
              // sucesso, quando `linkMessage()` o REESCREVE para apontar à
              // Message outbound enviada (Bloco 3b/4). Enquanto o envio não
              // é confirmado (ex.: falha de conexão do WhatsApp), o campo
              // ainda aponta para a mensagem INBOUND — sem esta guarda, o
              // selo "Gerada por IA" aparecia por engano numa bolha do
              // PRÓPRIO cliente (achado real: um áudio recebido do cliente
              // marcado como "gerado pela IA"). `Gerada por IA` só faz
              // sentido em mensagens outbound; nunca inferir o contrário.
              aiInteraction={
                message.direction === 'outbound'
                  ? interactionByMessageId.get(message.id)
                  : undefined
              }
            />
          </Fragment>
        );
      })}
    </ul>
  );
}
