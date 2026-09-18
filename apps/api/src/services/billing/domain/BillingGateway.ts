/** A assinatura como o Stripe a descreve, reduzida ao que o Francis usa. */
export interface GatewaySubscription {
  id: string;
  customerId: string;
  /** Preço do primeiro item — o Francis só vende assinatura de um item. */
  priceId?: string;
  /** Status cru do Stripe (`trialing`, `active`, `past_due`, `unpaid`, ...). */
  status: string;
  trialEnd?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
}

/** Um aviso do Stripe já com a assinatura conferida. */
export interface GatewayEvent {
  id: string;
  type: string;
  /** Cliente Stripe a que o aviso se refere, quando houver. */
  customerId?: string;
}

/**
 * Porta para o Stripe (B5, etapa 2). Tudo que sai do Francis para o Stripe
 * passa por aqui — o `BillingService` nunca vê a biblioteca `stripe`.
 */
export interface BillingGateway {
  createCustomer(input: { tenantId: string; name: string }): Promise<string>;
  createCheckoutSession(input: {
    customerId: string;
    tenantId: string;
    priceId: string;
    trialDays?: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string>;
  /**
   * Fecha as páginas de pagamento que o cliente ainda tem abertas. Chamado
   * antes de abrir outra: com duas abas, concluir as duas daria duas
   * assinaturas cobrando o mesmo cartão. Nunca lança por uma página que
   * venceu no meio do caminho.
   */
  expireOpenCheckoutSessions(customerId: string): Promise<void>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string>;
  /** A assinatura que vale agora para o cliente, ou `null` se ele não tem nenhuma. */
  findCurrentSubscription(customerId: string): Promise<GatewaySubscription | null>;
  /** Confere a assinatura do aviso. Lança `InvalidWebhookSignatureError` se não bater. */
  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): GatewayEvent;
}
