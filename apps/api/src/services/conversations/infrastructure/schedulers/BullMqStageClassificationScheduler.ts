import { Queue } from 'bullmq';

import { StageClassificationScheduler } from '../../domain/schedulers/StageClassificationScheduler';
import { AiReplyJobData, STAGE_CLASSIFY_JOB_NAME } from '../queues/AiReplyQueue';

/**
 * 3 minutos: tempo de a conversa "assentar". Cada mensagem (do cliente ou do
 * atendente) agenda um job; quando eles rodam, só o da mensagem mais recente
 * gasta uma chamada de IA. Na prática, UMA classificação por pausa da
 * conversa, não uma por mensagem — é o que mantém o custo baixo com a cota
 * gratuita do Gemini.
 */
export const DEFAULT_STAGE_CLASSIFY_DELAY_MS = 180_000;

export class BullMqStageClassificationScheduler implements StageClassificationScheduler {
  constructor(
    private readonly queue: Queue<AiReplyJobData>,
    private readonly delayMs: number = DEFAULT_STAGE_CLASSIFY_DELAY_MS,
  ) {}

  async schedule(tenantId: string, conversationId: string, messageId: string): Promise<void> {
    // `jobId` por MENSAGEM (descartável) e sem `:` — o BullMQ recusa `jobId`
    // com `:` salvo com exatamente 3 partes (incidente do balão único,
    // 2026-08-21), e o prefixo evita colidir com o `jobId` do `generate-reply`
    // da mesma mensagem.
    const jobId = `stage-${tenantId}-${conversationId}-${messageId}`;
    await this.queue.add(
      STAGE_CLASSIFY_JOB_NAME,
      { tenantId, conversationId, messageId },
      { jobId, delay: this.delayMs },
    );
  }
}
