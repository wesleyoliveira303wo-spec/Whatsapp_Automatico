import { Queue } from 'bullmq';

import { OutboundMessageCommand, OutboundMessageDispatcher } from '../../domain/dispatchers/OutboundMessageDispatcher';
import { WHATSAPP_OUTBOUND_JOB_NAME, WhatsAppOutboundJobData } from '../queues/WhatsAppOutboundQueue';

/**
 * Implementação real (produtor) de `OutboundMessageDispatcher` sobre a fila
 * BullMQ `whatsapp-outbound` — Milestone 3, Bloco 4 (ADR #54, decisão 2).
 *
 * Recebe a `Queue` já construída via injeção de dependência — mesmo
 * racional de `BullMqAiReplyScheduler` (não constrói a própria conexão
 * Redis; quem monta a `Queue` é o composition root que instancia esta
 * classe, dentro de `worker.ts`).
 *
 * IDEMPOTÊNCIA (decisão D2 do levantamento arquitetural do Bloco 4):
 * `jobId` = `command.aiInteractionId`. Cada `AiInteraction` bem-sucedida
 * produz no máximo UMA tentativa de envio — usar o próprio id da interação
 * como `jobId` aproveita uma relação 1:1 que já existe no desenho do Bloco
 * 3b, sem introduzir nenhum identificador novo só para este propósito. Uma
 * segunda chamada com o MESMO `aiInteractionId` (ex.: o worker de IA sendo
 * reexecutado para o mesmo job `ai-reply`, por retry do BullMQ) não cria um
 * segundo job de envio enquanto o primeiro ainda não tiver sido
 * concluído/removido.
 */
export class BullMqOutboundMessageDispatcher implements OutboundMessageDispatcher {
  constructor(private readonly queue: Queue<WhatsAppOutboundJobData>) {}

  async dispatch(command: OutboundMessageCommand): Promise<void> {
    // `jobId` = a chave de idempotência do comando. Fluxo da IA: o
    // `aiInteractionId` (relação 1:1, comportamento inalterado do Bloco 4).
    // Fluxo do operador (N2): o `idempotencyKey` (UUID gerado por envio), já
    // que não há `AiInteraction`. Um dos dois está sempre presente.
    await this.queue.add(WHATSAPP_OUTBOUND_JOB_NAME, command, {
      jobId: command.aiInteractionId ?? command.idempotencyKey,
    });
  }
}
