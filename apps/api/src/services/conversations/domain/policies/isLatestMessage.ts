import { Message } from '../entities/Message';
import { isNewerThan } from './shouldGenerateReply';

/**
 * `messageId` é a mensagem MAIS RECENTE da conversa, em QUALQUER direção
 * (cliente ou empresa) — portão de custo da classificação de estágio
 * (2026-09-11). Mesma ordem total `(occurredAt, id)` de `shouldGenerateReply`,
 * para empate de segundo nunca produzir duas classificações nem nenhuma.
 *
 * Diferença deliberada em relação a `shouldGenerateReply`: mensagem ausente
 * da lista devolve `false`. Lá, na dúvida, vale responder (cliente esperando);
 * aqui ninguém espera — e se a mensagem não está entre as mais recentes lidas,
 * certamente existe uma mais nova, cujo job fará a classificação.
 */
export function isLatestMessage(messages: Message[], messageId: string): boolean {
  const current = messages.find((message) => message.id === messageId);
  if (!current) {
    return false;
  }
  return !messages.some((message) => isNewerThan(message, current));
}
