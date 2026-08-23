/**
 * Erro de Domain para quando o operador tenta "Salvar contato" numa conversa
 * cujo `contactJid` não tem telefone real para derivar (o caso permanente é
 * `@lid` — endereço de privacidade do WhatsApp, ver `ContactResolver`) — botão
 * "Salvar contato" do painel de contexto da conversa (retrofit visual
 * 2026-08-18).
 *
 * Mapeado para HTTP 422 (entidade compreendida, mas impossível de processar)
 * em `conversationsErrorHandler` — distinto de 404 (a conversa existe e é do
 * tenant certo) e de 500 (não é uma falha inesperada, é uma limitação
 * conhecida e permanente daquele endereço).
 */
export class ConversationContactUnavailableError extends Error {
  constructor(conversationId: string) {
    super(`Contact identity unavailable for conversation: ${conversationId}`);
    this.name = 'ConversationContactUnavailableError';
  }
}
