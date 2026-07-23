import { Conversation } from '../../domain/entities/Conversation';

/**
 * DTO de saída para a operação GetConversation.
 * Contém a entidade de domínio completa, que será serializada pelo
 * controlador antes de ser enviada ao cliente.
 */
export interface GetConversationOutput {
  /**
   * Instância da conversa encontrada.
   */
  conversation: Conversation;
}
