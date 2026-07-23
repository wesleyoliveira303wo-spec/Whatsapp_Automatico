/**
 * Erro de Domain para quando um usuario tenta agir sobre uma conversa que NAO
 * lhe pertence e cujo cargo NAO permite agir sobre a de outros — Milestone 5,
 * Bloco M5D (ownership, D57). Ex.: um Operator tentando retomar uma conversa
 * assumida por outro Operator (so `resume_own`; `resume_any` e de Manager+).
 *
 * Mapeado para HTTP 403 em `conversationsErrorHandler` — distinto de
 * `ConversationNotFoundError` (404): aqui a conversa EXISTE e o tenant e o
 * certo; o que falta e a autorizacao sobre AQUELE recurso especifico.
 */
export class ConversationOwnershipError extends Error {
  constructor(conversationId: string) {
    super(`Conversation not owned by actor: ${conversationId}`);
    this.name = 'ConversationOwnershipError';
  }
}
