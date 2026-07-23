/**
 * Erro de Domain para quando uma `WhatsAppSession` é referenciada por `id`
 * mas não existe no repositório. Substitui o uso de `Error` genérico, para
 * que a camada de Presentation (futuro `errorMiddleware`) possa mapear este
 * erro para um status HTTP específico (404) pelo nome da classe, e não por
 * comparação de string de mensagem.
 */
export class WhatsAppSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`WhatsApp session not found: ${sessionId}`);
    this.name = 'WhatsAppSessionNotFoundError';
  }
}
