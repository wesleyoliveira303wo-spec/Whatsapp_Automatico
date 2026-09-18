/**
 * O `/admin` tentou trocar o plano de um tenant que paga pelo Stripe (B5,
 * etapa 2). Recusado: a cobrança continuaria correndo enquanto o plano dizia
 * outra coisa. Quem troca é o cliente, pelo portal — ou o fundador cancela a
 * assinatura no Stripe primeiro. Traduzido para 409 pelo error handler.
 */
export class TenantPlanManagedBySubscriptionError extends Error {
  constructor() {
    super('Este plano é gerenciado pela assinatura do cliente no Stripe.');
    this.name = 'TenantPlanManagedBySubscriptionError';
  }
}
