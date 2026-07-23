/**
 * Constantes/tipos da fila BullMQ `ai-reply` — Milestone 3, Bloco 4 (ver
 * `MILESTONE_003_AI_AUTORESPONDER.md` §2.1/§3-Bloco 4, ADR #54).
 *
 * Vive em Infrastructure (não em Domain): `AiReplyScheduler` (Domain, Bloco
 * 2) não sabe nada sobre BullMQ — só quem IMPLEMENTA o port
 * (`BullMqAiReplyScheduler`) e quem CONSOME a fila (o worker de IA,
 * `apps/api/src/worker.ts`, Bloco 4) precisam deste nome/formato de job.
 * Arquivo compartilhado entre produtor e consumidor para não duplicar o
 * nome da fila nem o shape do payload em dois lugares.
 */

/** Nome da fila BullMQ que carrega pedidos de geração de resposta de IA. */
export const AI_REPLY_QUEUE_NAME = 'ai-reply';

/**
 * Nome do job dentro da fila `ai-reply` — distinto do nome da FILA em si
 * (BullMQ permite múltiplos nomes de job na mesma fila; este projeto só usa
 * um, mas o parâmetro é obrigatório em `Queue.add()`). Único tipo de job
 * que esta fila carrega neste bloco.
 */
export const AI_REPLY_JOB_NAME = 'generate-reply';

/**
 * Payload de um job `ai-reply` — espelha exatamente os parâmetros de
 * `AiReplyScheduler.schedule(tenantId, conversationId, messageId)` (Domain,
 * Bloco 2). `messageId` aqui é o id da `Message` INBOUND que disparou o
 * agendamento (não confundir com a futura `Message` outbound gerada pela
 * IA) — usado pelo worker para montar a chave de idempotência do job (ver
 * `BullMqAiReplyScheduler`).
 */
export interface AiReplyJobData {
  tenantId: string;
  conversationId: string;
  messageId: string;
}
