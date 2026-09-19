import { Queue } from 'bullmq';

import { buildJobId } from '../../../../shared/infrastructure/queue/jobId';
import { BillingGraceScheduler } from '../../domain/schedulers/BillingGraceScheduler';
import { BILLING_GRACE_JOB_NAME, BillingGraceJobData } from '../queues/BillingGraceQueue';

/**
 * `jobId` estável por `(tenant, assinatura, momento em que entrou em
 * atraso)` — se `syncFromStripe` rodar de novo enquanto a assinatura já está
 * em atraso (aviso repetido/fora de ordem), o BullMQ recusa duplicar o job
 * sozinho, sem checagem própria em `BillingService`.
 */
export class BullMqBillingGraceScheduler implements BillingGraceScheduler {
  constructor(private readonly queue: Queue<BillingGraceJobData>) {}

  async schedule(
    tenantId: string,
    subscriptionId: string,
    pastDueSince: Date,
    firesAt: Date,
  ): Promise<void> {
    const jobId = buildJobId(
      'billing-grace',
      tenantId,
      subscriptionId,
      String(pastDueSince.getTime()),
    );
    await this.queue.add(
      BILLING_GRACE_JOB_NAME,
      { tenantId, subscriptionId },
      { jobId, delay: firesAt.getTime() - Date.now() },
    );
  }
}
