/** Registro de avisos do Stripe já processados — a garantia de "uma vez só". */
export interface BillingEventRepository {
  exists(stripeEventId: string): Promise<boolean>;
  /** Grava o aviso; se outro processo gravou antes, não faz nada. */
  record(input: { stripeEventId: string; type: string; tenantId?: string }): Promise<void>;
}
