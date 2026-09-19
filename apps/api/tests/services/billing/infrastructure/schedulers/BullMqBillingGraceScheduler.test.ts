import { Queue } from 'bullmq';

import { BullMqBillingGraceScheduler } from '../../../../../src/services/billing/infrastructure/schedulers/BullMqBillingGraceScheduler';
import {
  BILLING_GRACE_JOB_NAME,
  BillingGraceJobData,
} from '../../../../../src/services/billing/infrastructure/queues/BillingGraceQueue';
import { buildJobId } from '../../../../../src/shared/infrastructure/queue/jobId';

describe('BullMqBillingGraceScheduler (B5, etapa 3)', () => {
  it('agenda com jobId estável por (tenant, assinatura, momento em que entrou em atraso) e o delay até firesAt', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as Queue<BillingGraceJobData>;
    const scheduler = new BullMqBillingGraceScheduler(queue);

    const pastDueSince = new Date('2026-09-18T00:00:00.000Z');
    const firesAt = new Date('2026-09-21T00:00:00.000Z');
    const now = new Date('2026-09-19T00:00:00.000Z');
    jest.useFakeTimers({ now });

    await scheduler.schedule('t1', 'sub_1', pastDueSince, firesAt);

    expect(add).toHaveBeenCalledWith(
      BILLING_GRACE_JOB_NAME,
      { tenantId: 't1', subscriptionId: 'sub_1' },
      {
        jobId: buildJobId('billing-grace', 't1', 'sub_1', String(pastDueSince.getTime())),
        delay: firesAt.getTime() - now.getTime(),
      },
    );

    jest.useRealTimers();
  });

  it('um jobId estável evita duplicar o job se syncFromStripe rodar de novo enquanto já está em atraso', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as Queue<BillingGraceJobData>;
    const scheduler = new BullMqBillingGraceScheduler(queue);
    const pastDueSince = new Date('2026-09-18T00:00:00.000Z');

    await scheduler.schedule('t1', 'sub_1', pastDueSince, new Date('2026-09-21T00:00:00.000Z'));
    await scheduler.schedule('t1', 'sub_1', pastDueSince, new Date('2026-09-21T00:00:00.000Z'));

    const [firstCall, secondCall] = add.mock.calls;
    expect(firstCall[2].jobId).toBe(secondCall[2].jobId);
  });
});
