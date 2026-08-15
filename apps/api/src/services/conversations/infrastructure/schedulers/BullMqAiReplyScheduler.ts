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
/**
 * Janela de agrupamento de rajada, em milissegundos (2026-08-14 — ver
 * docstring de `schedule()`). 8s: longo o bastante para uma pessoa terminar
 * de escrever o que estava digitando, curto o bastante para a resposta ainda
 * parecer imediata num chat (um atendente humano costuma levar mais que
 * isso).
 */
export const DEFAULT_AI_REPLY_DEBOUNCE_MS = 8_000;

export class BullMqAiReplyScheduler implements AiReplyScheduler {
  constructor(
    private readonly queue: Queue<AiReplyJobData>,
    private readonly debounceMs: number = DEFAULT_AI_REPLY_DEBOUNCE_MS,
  ) {}

  /**
   * AGRUPAMENTO DE MENSAGENS EM RAJADA (2026-08-14, bug real de produção).
   *
   * O que mudou aqui: o job passou a entrar na fila com `delay`, em vez de
   * imediatamente. O `jobId` continua sendo `tenant:conversa:MENSAGEM` — uma
   * chave por mensagem, como sempre foi.
   *
   * O atraso é a metade do mecanismo; a outra metade é a policy
   * `shouldGenerateReply` (Domain), aplicada no processamento. Os 8 segundos
   * dão tempo de os fragmentos seguintes da mesma rajada chegarem e criarem
   * seus próprios jobs; quando cada job enfim roda, só aquele cuja mensagem
   * for a inbound MAIS RECENTE gera resposta — os demais encerram sem custo,
   * e o vencedor lê o histórico completo, portanto a rajada inteira.
   *
   * O relógio, na prática, é reiniciado a cada mensagem nova (o job de cada
   * fragmento tem seu próprio atraso), então a resposta sai ~8s depois de o
   * cliente PARAR de escrever — que é exatamente o que um atendente humano
   * faz: lê tudo e responde uma vez.
   *
   * DESENHO DESCARTADO, registrado para não ser reintroduzido: chegou a ser
   * implementado um `jobId` por CONVERSA (sem `messageId`), usando o descarte
   * de duplicata do BullMQ como agrupador. Parece equivalente e não é — o
   * BullMQ descarta enquanto a chave do job existir em Redis, o que inclui
   * `active` e `failed`. Isso fazia mensagem de cliente sumir em silêncio
   * durante o processamento, e um único job falho matava a IA daquela
   * conversa permanentemente. Ver a docstring de `shouldGenerateReply` para o
   * detalhe completo.
   *
   * IDEMPOTÊNCIA (inalterada desde o Bloco 4): o `jobId` por mensagem
   * continua evitando que o MESMO evento inbound gere duas entradas na fila
   * (ex.: `MessageIngestionService.handle()` chamado duas vezes por
   * reconexão/retry do Baileys). Isso complementa — não substitui — a
   * re-checagem de `shouldAutoRespond()` feita pelo worker no momento de
   * processar: são proteções para riscos diferentes.
   */
  async schedule(tenantId: string, conversationId: string, messageId: string): Promise<void> {
    const jobId = `${tenantId}:${conversationId}:${messageId}`;
    await this.queue.add(
      AI_REPLY_JOB_NAME,
      { tenantId, conversationId, messageId },
      { jobId, delay: this.debounceMs },
    );
  }
}
