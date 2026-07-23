/**
 * Erro de Domain para quando um operador tenta ENVIAR uma mensagem por uma
 * conversa que ainda está em modo `'bot'` (a IA é quem responde) — feature de
 * resposta pela Dashboard (N2). Para responder manualmente, o operador precisa
 * primeiro ASSUMIR a conversa (escalar para `'human'`); enquanto ela estiver em
 * `'bot'`, um envio manual competiria com a IA pelo mesmo canal.
 *
 * Mapeado para HTTP 409 (conflito de estado) em `conversationsErrorHandler` —
 * distinto de 403 (ownership) e 404 (inexistente): a conversa existe e é do
 * tenant certo, mas está num estado incompatível com a ação.
 */
export class ConversationNotHumanError extends Error {
  constructor(conversationId: string) {
    super(`Conversation is not in human mode: ${conversationId}`);
    this.name = 'ConversationNotHumanError';
  }
}
