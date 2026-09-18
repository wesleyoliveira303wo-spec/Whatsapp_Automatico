import { TenantPlan } from '../../../../shared/tenant/domain/TenantPlan';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

/**
 * O retrato local da assinatura do tenant no Stripe (B5, etapa 2). Existe
 * desde que o tenant ganha um cliente no Stripe (primeiro clique em Assinar) —
 * antes de haver assinatura, `stripeSubscriptionId`/`plan`/`status` ficam
 * vazios. A fonte de verdade é o Stripe; esta linha é reconciliada a cada
 * aviso.
 */
export interface Subscription {
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  plan?: TenantPlan;
  status?: SubscriptionStatus;
  trialEndsAt?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  /** Primeira vez que a assinatura foi vista em atraso; limpa ao pagar. */
  pastDueSince?: Date;
  updatedAt: Date;
}
