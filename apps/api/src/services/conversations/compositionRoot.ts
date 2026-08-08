import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

import { Logger } from '../../shared/domain/Logger';
import { PrismaTenantRepository } from '../../shared/tenant/infrastructure/PrismaTenantRepository';
import { PrismaAuditLogRepository } from '../auth/infrastructure/repositories/PrismaAuditLogRepository';
import { PrismaConversationRepository } from './infrastructure/repositories/PrismaConversationRepository';
import { PrismaMessageRepository } from './infrastructure/repositories/PrismaMessageRepository';
import { ConversationRepository } from './domain/repositories/ConversationRepository';
import { MessageRepository } from './domain/repositories/MessageRepository';
import { AI_REPLY_QUEUE_NAME, AiReplyJobData } from './infrastructure/queues/AiReplyQueue';
import { BullMqAiReplyScheduler } from './infrastructure/schedulers/BullMqAiReplyScheduler';
import { PrismaAiAvailabilityRepository } from './infrastructure/repositories/PrismaAiAvailabilityRepository';
import { InMemorySlidingWindowAiRateLimiter } from './infrastructure/repositories/InMemorySlidingWindowAiRateLimiter';
import { MessageIngestionService } from './application/MessageIngestionService';
import { ConversationsService } from './application/ConversationsService';
import {
  WHATSAPP_OUTBOUND_QUEUE_NAME,
  WhatsAppOutboundJobData,
} from '../whatsapp/infrastructure/queues/WhatsAppOutboundQueue';
import { BullMqOutboundMessageDispatcher } from '../whatsapp/infrastructure/dispatchers/BullMqOutboundMessageDispatcher';

/**
 * Composition root do bounded context `conversations` — Milestone 3, Bloco 5
 * (D6/D15 do levantamento arquitetural). Mesmo papel de
 * `services/whatsapp/compositionRoot.ts`: único lugar do código de produção
 * que conhece simultaneamente Infrastructure concreta (Prisma, BullMQ,
 * ioredis) e as portas de Domain/Application que este bounded context expõe.
 *
 * Recebe `redisConnection` já pronta (não constrói a própria conexão
 * `ioredis` aqui) — quem decide a topologia de conexões Redis do processo
 * HTTP é `index.ts` (D19: duas conexões distintas dentro de `apps/api`, uma
 * para esta fila produtora, outra para o `Worker` consumidor de
 * `whatsapp-outbound` — ver `createOutboundCommandConsumerWorker` em
 * `services/whatsapp/compositionRoot.ts`). Função pura em relação a
 * `process.env`, mesmo racional de `createWhatsAppSessionsRegistry`.
 *
 * `PrismaTenantRepository` é reconstruído aqui (nova instância, mesmo
 * `prisma`) em vez de recebida por parâmetro — mesma decisão consciente já
 * documentada em `createWhatsAppSessionsComposition` (Production Hardening):
 * é um wrapper sem estado próprio, então uma segunda instância não introduz
 * nenhum comportamento divergente, e evita alargar a assinatura desta função
 * só para repassar uma peça que ela mesma sabe construir.
 */
export interface ConversationsComposition {
  conversationRepository: ConversationRepository;
  messageRepository: MessageRepository;
  /**
   * Implementa `MessageReceivedHandler` (porta de `services/whatsapp`) —
   * consumido por `createWhatsAppSessionsRegistry`/`createWhatsAppSessionsComposition`
   * (D5). Por isso a ORDEM de chamada em `index.ts` importa: esta composição
   * precisa ser montada ANTES da composição de `whatsapp` (D15).
   */
  messageIngestionService: MessageIngestionService;
  conversationsService: ConversationsService;
}

export function createConversationsComposition(
  prisma: PrismaClient,
  redisConnection: IORedis,
  logger: Logger,
): ConversationsComposition {
  const conversationRepository = new PrismaConversationRepository(prisma);
  const messageRepository = new PrismaMessageRepository(prisma);
  const tenantRepository = new PrismaTenantRepository(prisma);

  const aiReplyQueue = new Queue<AiReplyJobData>(AI_REPLY_QUEUE_NAME, {
    connection: redisConnection,
  });
  const aiReplyScheduler = new BullMqAiReplyScheduler(aiReplyQueue);

  // Feature N2 (responder pela Dashboard): produtor da fila outbound, para o
  // operador enviar pela MESMA fila da IA (consumida pelo OutboundCommandConsumer
  // dentro do apps/api). Reusa a mesma `redisConnection` — dois produtores
  // (ai-reply + whatsapp-outbound) podem compartilhar a conexão; `maxRetries`
  // só importa para o Worker consumidor (D19, já tratado em index.ts).
  const outboundQueue = new Queue<WhatsAppOutboundJobData>(WHATSAPP_OUTBOUND_QUEUE_NAME, {
    connection: redisConnection,
  });
  const outboundMessageDispatcher = new BullMqOutboundMessageDispatcher(outboundQueue);

  const auditLogRepository = new PrismaAuditLogRepository(prisma);

  // Fase 1 (2026-08-07) — Botão POWER: lê a MESMA tabela do Cérebro da IA
  // (`ai_business_profiles`, `services/ai`) via uma porta estreita própria
  // deste módulo — ver docstring de `AiAvailabilityRepository` para o porquê
  // de não importar `AiBusinessProfileRepository` diretamente.
  const aiAvailabilityRepository = new PrismaAiAvailabilityRepository(prisma);

  // Fase 1, Bloco F1.10 — instância única por processo: a janela deslizante
  // vive em memória (ver docstring da classe), então precisa ser a MESMA
  // instância a cada mensagem, nunca recriada por request.
  const aiRateLimiter = new InMemorySlidingWindowAiRateLimiter();

  const messageIngestionService = new MessageIngestionService(
    conversationRepository,
    messageRepository,
    aiReplyScheduler,
    aiAvailabilityRepository,
    aiRateLimiter,
  );
  const conversationsService = new ConversationsService(
    conversationRepository,
    messageRepository,
    tenantRepository,
    auditLogRepository,
    logger,
    outboundMessageDispatcher,
  );

  return {
    conversationRepository,
    messageRepository,
    messageIngestionService,
    conversationsService,
  };
}
