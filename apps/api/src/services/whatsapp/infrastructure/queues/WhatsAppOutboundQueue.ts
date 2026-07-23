import { OutboundMessageCommand } from '../../domain/dispatchers/OutboundMessageDispatcher';

/**
 * Constantes da fila BullMQ `whatsapp-outbound` — Milestone 3, Bloco 4 (ADR
 * #54, decisão 2). Mesmo racional de `AiReplyQueue.ts`
 * (`services/conversations/infrastructure/queues/`): vive em Infrastructure,
 * compartilhado entre produtor (`BullMqOutboundMessageDispatcher`, chamado
 * de dentro de `worker.ts`) e consumidor (`OutboundCommandConsumer`,
 * instanciado dentro de `apps/api`).
 */
export const WHATSAPP_OUTBOUND_QUEUE_NAME = 'whatsapp-outbound';

export const WHATSAPP_OUTBOUND_JOB_NAME = 'send-message';

/** Reexportado por conveniência — o payload do job É o `OutboundMessageCommand` (Domain), sem nenhum campo extra específico de BullMQ. */
export type WhatsAppOutboundJobData = OutboundMessageCommand;
