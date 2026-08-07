/**
 * Erro de Domain (Redesign 2026-08-05, R5) para quando não há NENHUMA
 * mensagem na conversa — não há o que resumir. Distinto de
 * `ConversationNotFoundError` (`services/conversations/domain/errors`, que
 * `ConversationSummaryService` reusa quando o `id` não existe/não pertence
 * ao tenant): aqui a conversa existe, só não tem histórico ainda (caso de
 * borda improvável na prática — toda conversa nasce de uma mensagem
 * inbound — mas o tipo é opcional em `Message[]`, então o caminho existe).
 */
export class ConversationSummaryUnavailableError extends Error {
  constructor(conversationId: string) {
    super(`Conversa ${conversationId} não tem mensagens suficientes para gerar um resumo.`);
    this.name = 'ConversationSummaryUnavailableError';
  }
}
