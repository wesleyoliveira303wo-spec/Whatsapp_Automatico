/**
 * Erro de Domain para faixa de tempo invalida numa consulta de Analytics
 * (Milestone 4, Bloco M4B) — ex.: `from` depois de `to`, ou janela acima do
 * teto permitido (`MAX_WINDOW_DAYS` em `AnalyticsService`). Substitui `Error`
 * generico para que a Presentation (M4C, `analyticsErrorHandler`) possa mapear
 * para HTTP 400 pelo NOME da classe, nunca por comparacao de string — mesmo
 * padrao de `WhatsAppSessionNotFoundError`/`ConversationNotFoundError`.
 */
export class InvalidAnalyticsRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAnalyticsRangeError';
  }
}
