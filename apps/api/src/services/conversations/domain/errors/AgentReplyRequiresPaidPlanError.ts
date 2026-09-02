/**
 * Erro de Domain para quando um operador de um tenant no **Plano Grátis**
 * tenta responder uma conversa pela Dashboard (texto ou mídia) — Lançamento
 * suave, 2026-08-31 (Trava de plano, ver `planPermiteUso` e `CONTEXT.md`).
 *
 * No Plano Grátis a tela de Conversas é só-leitura: o operador vê as
 * mensagens chegando mas não envia. Responder pela Dashboard (como a IA
 * responder sozinha e disparar campanhas) fica atrás da Trava — só
 * `pro`/`enterprise`.
 *
 * Mapeado para HTTP 403 em `conversationsErrorHandler` (recurso pago),
 * espelhando `ConversationNotHumanError` -> 409: a conversa existe e é do
 * tenant certo, mas o plano não permite a ação.
 */
export class AgentReplyRequiresPaidPlanError extends Error {
  constructor() {
    super(
      'Responder pela Dashboard é um recurso do Plano Pro. Fale com o comercial para ativar seu plano.',
    );
    this.name = 'AgentReplyRequiresPaidPlanError';
  }
}
