import { Conversation } from '../entities/Conversation';

/**
 * Decide se uma conversa deve receber resposta automática da IA para novas
 * mensagens inbound — Milestone 3, Bloco 2.
 *
 * Extraída como função pura de Domain (mesmo padrão de
 * `isDisconnectReasonRecoverable`, em `services/whatsapp/domain/policies/`),
 * não um método na entidade `Conversation` (que permanece uma interface de
 * dados simples, mesmo estilo já usado em `WhatsAppSession`) — mantém a regra
 * testável isoladamente, sem instanciar nenhum serviço.
 *
 * Usada em DOIS pontos ao longo desta Milestone (mesma função, nunca
 * duplicada): aqui no Bloco 2 (`MessageIngestionService`, ao decidir se
 * agenda a IA) e, de novo, dentro do worker no Bloco 4 — que RE-CHECA esta
 * mesma condição no momento de processar o job, não só ao enfileirar (ver
 * `MILESTONE_003_AI_AUTORESPONDER.md` §5, risco "Job na fila processado
 * depois que a conversa já foi escalonada", e §6, critério de aceite
 * correspondente).
 */
export function shouldAutoRespond(conversation: Conversation): boolean {
  return conversation.status === 'bot';
}
