/**
 * Agenda a expiração de uma assinatura em atraso (B5, etapa 3 — tolerância de
 * 3 dias). `firesAt` já vem calculado por quem chama (`pastDueSince + 3
 * dias`) — o scheduler só agenda, nunca decide o prazo. Nunca lança: agendar
 * é auxiliar, uma falha aqui não pode derrubar `syncFromStripe`.
 */
export interface BillingGraceScheduler {
  schedule(
    tenantId: string,
    subscriptionId: string,
    pastDueSince: Date,
    firesAt: Date,
  ): Promise<void>;
}
