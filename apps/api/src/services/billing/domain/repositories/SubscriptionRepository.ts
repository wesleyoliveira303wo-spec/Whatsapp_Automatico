import { TenantPlan } from '../../../../shared/tenant/domain/TenantPlan';
import { Subscription, SubscriptionStatus } from '../entities/Subscription';

/** Tudo que a reconciliação grava. `null` limpa o campo. */
export interface SubscriptionState {
  stripeSubscriptionId: string | null;
  plan: TenantPlan | null;
  status: SubscriptionStatus | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  pastDueSince: Date | null;
}

export interface SubscriptionRepository {
  findByTenant(tenantId: string): Promise<Subscription | null>;
  findByCustomerId(stripeCustomerId: string): Promise<Subscription | null>;
  /** Cria a linha do cliente; se já existir (clique duplo), devolve a existente. */
  createForCustomer(tenantId: string, stripeCustomerId: string): Promise<Subscription>;
  saveState(tenantId: string, state: SubscriptionState): Promise<Subscription>;
}
