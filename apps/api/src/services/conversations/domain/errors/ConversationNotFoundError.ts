/**
 * Erro de Domain para quando uma `Conversation` é referenciada por `id`
 * (escopada a um `tenantId`) mas não existe — Milestone 3, Bloco 5. Mesmo
 * padrão de `WhatsAppSessionNotFoundError`: substitui `Error` genérico para
 * que a camada de Presentation (`conversationsErrorHandler`) mapeie por
 * `instanceof`, nunca por comparação de string de mensagem.
 *
 * Usado tanto para "a conversa não existe de fato" quanto para "existe, mas
 * pertence a outro tenant" — as duas situações recebem a mesma resposta
 * (404), nunca 403: diferenciar os dois casos ao cliente vazaria a
 * existência de dados de outro tenant (mesmo racional de segurança já
 * aplicado por `updateStatus`/`listByConversation` devolverem
 * `undefined`/lista vazia em vez de um erro de autorização específico).
 */
export class ConversationNotFoundError extends Error {
  constructor(conversationId: string) {
    super(`Conversation not found: ${conversationId}`);
    this.name = 'ConversationNotFoundError';
  }
}
