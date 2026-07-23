import { Queue } from 'bullmq';

import { AiReplyScheduler } from '../../domain/schedulers/AiReplyScheduler';
import { AI_REPLY_JOB_NAME, AiReplyJobData } from '../queues/AiReplyQueue';

/**
 * Implementação real (produtor) de `AiReplyScheduler` sobre a fila BullMQ
 * `ai-reply` — Milestone 3, Bloco 4 (ver `MILESTONE_003_AI_AUTORESPONDER.md`
 * §2.1/§3-Bloco 4).
 *
 * Recebe a `Queue` já construída via injeção de dependência (constructor),
 * nunca constrói a própria conexão Redis aqui — mesmo racional já aplicado a
 * todo repositório Prisma deste projeto (`PrismaConversationRepository`
 * recebe `PrismaClient`, não cria um). Quem monta a `Queue` (com a conexão
 * Redis resolvida a partir de `REDIS_URL`) é o composition root que instancia
 * esta classe — Bloco 5 para o lado HTTP de `apps/api`, `worker.ts` (Bloco 4)
 * para o lado consumidor.
 *
 * IDEMPOTÊNCIA DO JOB `ai-reply` (achado do levantamento arquitetural do
 * Bloco 4, resolvido aqui): `jobId` é derivado de
 * `tenantId:conversationId:messageId` (o `messageId` é da mensagem INBOUND
 * que disparou o agendamento, único por definição). BullMQ trata `jobId`
 * como chave de deduplicação nativa — uma segunda chamada com o MESMO
 * `jobId` enquanto o job anterior ainda não foi concluído/removido não cria
 * um segundo job. Isso complementa (não substitui) a responsabilidade do
 * WORKER de re-checar `shouldAutoRespond()` no momento de processar (ver
 * docstring de `ConversationAiService`, achado F1): esta chave evita que o
 * MESMO evento inbound gere duas ENTRADAS na fila (ex.: `MessageIngestionService.
 * handle()` chamado duas vezes para o mesmo `message_received`, por
 * reconexão/retry do Baileys); a re-checagem no worker evita responder a uma
 * conversa JÁ ESCALONADA entre o agendamento e o processamento — são duas
 * proteções para duas classes de risco diferentes, não redundantes.
 */
export class BullMqAiReplyScheduler implements AiReplyScheduler {
  constructor(private readonly queue: Queue<AiReplyJobData>) {}

  async schedule(tenantId: string, conversationId: string, messageId: string): Promise<void> {
    const jobId = `${tenantId}:${conversationId}:${messageId}`;
    await this.queue.add(
      AI_REPLY_JOB_NAME,
      { tenantId, conversationId, messageId },
      { jobId },
    );
  }
}
