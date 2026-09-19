import { Logger } from '../../../shared/domain/Logger';
import { BillingGateway } from '../domain/BillingGateway';
import { SubscriptionRepository } from '../domain/repositories/SubscriptionRepository';
import { toSubscriptionStatus } from '../domain/subscriptionState';
import { BillingGraceJobData } from './queues/BillingGraceQueue';

/**
 * Roda ao fim da tolerância de 3 dias (B5, etapa 3). RELÊ o Stripe — nunca
 * decide pelo relógio local: se a fatura foi paga nesse meio-tempo, não faz
 * nada; o cancelamento gera `customer.subscription.deleted`, que volta pelo
 * webhook normal e aplica a descida pelo caminho de sempre
 * (`syncFromStripe` → `PlanChangeService`). Este processador NUNCA chama
 * `syncFromStripe`/`PlanChangeService` diretamente.
 */
export class BillingGraceJobProcessor {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly gateway: BillingGateway,
    private readonly logger: Logger,
  ) {}

  async process(data: BillingGraceJobData): Promise<void> {
    const { tenantId, subscriptionId } = data;
    const local = await this.subscriptions.findByTenant(tenantId);
    if (!local || local.stripeSubscriptionId !== subscriptionId) {
      // A assinatura mudou desde que o job foi agendado (cancelada,
      // trocada, ou nunca existiu) — nada a fazer.
      this.logger.info('billing-grace: assinatura mudou desde o agendamento, nada a fazer', {
        tenantId,
        subscriptionId,
      });
      return;
    }

    const current = await this.gateway.findCurrentSubscription(local.stripeCustomerId);
    if (!current) {
      this.logger.info('billing-grace: assinatura não existe mais no Stripe', {
        tenantId,
        subscriptionId,
      });
      return;
    }

    if (toSubscriptionStatus(current.status) !== 'past_due') {
      this.logger.info('billing-grace: assinatura não está mais em atraso', {
        tenantId,
        subscriptionId,
      });
      return;
    }

    await this.gateway.cancelSubscription(subscriptionId);
    this.logger.info('billing-grace: assinatura cancelada por atraso vencido', {
      tenantId,
      subscriptionId,
    });
  }
}
