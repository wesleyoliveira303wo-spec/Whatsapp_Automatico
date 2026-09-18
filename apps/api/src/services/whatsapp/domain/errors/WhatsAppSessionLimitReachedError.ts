/**
 * O plano do tenant já ocupa todas as vagas de WhatsApp (B5, 2026-09-18 — ver
 * `sessionLimitFor` em `shared/tenant/domain/planCapabilities.ts`).
 *
 * Traduzido para 409 `session_limit_reached` por `whatsAppErrorHandler`: o
 * pedido é válido, mas o estado da conta não permite. A mensagem vai direto
 * para a tela, então fala a língua de quem está conectando um número.
 */
export class WhatsAppSessionLimitReachedError extends Error {
  constructor(readonly limit: number) {
    super(
      limit === 1
        ? 'Seu plano permite 1 WhatsApp conectado. Para conectar outro, remova o atual ou mude de plano.'
        : `Seu plano permite até ${limit} WhatsApps conectados. Para conectar outro, remova um deles ou mude de plano.`,
    );
    this.name = 'WhatsAppSessionLimitReachedError';
  }
}
