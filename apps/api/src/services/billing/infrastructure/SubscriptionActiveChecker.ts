import { ActiveSubscriptionChecker } from '../../platform/domain/providers/ActiveSubscriptionChecker';
import { SubscriptionRepository } from '../domain/repositories/SubscriptionRepository';
import { ACTIVE_SUBSCRIPTION_STATUSES } from '../domain/subscriptionState';

/** Implementa a porta do `/admin` lendo a assinatura local (B5, etapa 2). */
export class SubscriptionActiveChecker implements ActiveSubscriptionChecker {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async hasActiveSubscription(tenantId: string): Promise<boolean> {
    const subscription = await this.subscriptions.findByTenant(tenantId);
    return Boolean(
      subscription?.status && ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status),
    );
  }
}
