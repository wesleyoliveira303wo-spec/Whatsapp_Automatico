/** Chaves do Stripe ausentes no ambiente: a cobrança está desligada (503). */
export class BillingNotConfiguredError extends Error {
  constructor() {
    super('A assinatura pelo site ainda não está disponível.');
    this.name = 'BillingNotConfiguredError';
  }
}

/** A assinatura do aviso não bate com `STRIPE_WEBHOOK_SECRET` (400, nada gravado). */
export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super('Assinatura do aviso do Stripe inválida.');
    this.name = 'InvalidWebhookSignatureError';
  }
}

/** Plano pago ativado pela equipe: não se assina pelo site (409). */
export class PlanManagedManuallyError extends Error {
  constructor() {
    super('Seu plano foi ativado pela equipe do Francis. Para mudar, fale com o comercial.');
    this.name = 'PlanManagedManuallyError';
  }
}

/** Já existe assinatura valendo: trocar de plano é pelo portal (409). */
export class SubscriptionAlreadyActiveError extends Error {
  constructor() {
    super('Você já tem uma assinatura. Para trocar de plano, use "Gerenciar assinatura".');
    this.name = 'SubscriptionAlreadyActiveError';
  }
}

/** O tenant ainda não tem cliente no Stripe, então não há portal para abrir (409). */
export class NoBillingAccountError extends Error {
  constructor() {
    super('Você ainda não tem uma assinatura.');
    this.name = 'NoBillingAccountError';
  }
}
