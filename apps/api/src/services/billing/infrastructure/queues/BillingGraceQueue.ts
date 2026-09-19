/** Nome da fila BullMQ da tolerância de atraso (B5, etapa 3). */
export const BILLING_GRACE_QUEUE_NAME = 'billing-grace';

/** Nome do job — só existe um tipo nesta fila. */
export const BILLING_GRACE_JOB_NAME = 'expire';

export interface BillingGraceJobData {
  tenantId: string;
  subscriptionId: string;
}
