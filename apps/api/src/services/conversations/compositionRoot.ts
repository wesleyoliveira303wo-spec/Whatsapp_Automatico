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
import { PrismaContactRepository } from '../contacts/infrastructure/repositories/PrismaContactRepository';
import { WhatsAppJidContactResolver } from '../contacts/infrastructure/WhatsAppJidContactResolver';
import { PrismaConsentEventRepository } from '../contacts/infrastructure/repositories/PrismaConsentEventRepository';
import { ContactConsentService } from '../contacts/application/ContactConsentService';
import { KeywordOptOutDetector } from '../contacts/infrastructure/KeywordOptOutDetector';
import { ConversationsService } from './application/ConversationsService';
import { AgentMediaCache } from './infrastructure/AgentMediaCache';
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
  /**
   * Bug real (2026-08-20) — a mesma instância também precisa ser injetada em
   * `WhatsAppCampaignMessageSender` (`index.ts`), senão mídia de campanha
   * nunca aparece na prévia da Dashboard: `getMessageMedia` procura primeiro
   * neste cache (mídia enviada por NÓS nunca tem referência real ao CDN do
   * WhatsApp, ADR #90); sem `.set()` no envio de campanha, cai no fallback
   * de `mediaDownloader.download()`, que tenta descriptografar
   * `mediaKeyEncrypted` VAZIO (de propósito) e lança "Invalid initialization
   * vector" — a imagem falha ao carregar na conversa.
   */
  agentMediaCache: AgentMediaCache;
  /**
   * Fase 1, Bloco F1.10 (observabilidade mínima) — exposta para o endpoint
   * `/health/ready` (`index.ts`) conseguir reportar profundidade da fila
   * (`getJobCounts`), sem precisar reconstruir uma segunda `Queue` sobre a
   * mesma conexão só para isso.
   */
  aiReplyQueue: Queue<AiReplyJobData>;
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
    // Higiene de fila (2026-08-14): jobs concluídos não precisam ficar
    // acumulando em Redis. Falhas ficam retidas (limite alto, não infinito) —
    // são justamente o que se quer inspecionar depois, e `/health/ready`
    // reporta a contagem.
    //
    // NOTA IMPORTANTE, para quem for mexer no `jobId`: estas opções são
    // higiene, NÃO uma dependência de correção — e só continuam sendo higiene
    // porque o `jobId` é por MENSAGEM (`tenant:conversa:mensagem`), portanto
    // descartável. Se um dia o `jobId` voltar a ser por CONVERSA, ele vira uma
    // trava viva: o BullMQ recusa silenciosamente um `add()` cuja chave ainda
    // exista em Redis — inclusive nos estados `active` e `failed` —, então um
    // job retido em `failed` pararia a IA daquela conversa permanentemente, e
    // mensagens chegadas durante o processamento sumiriam sem deixar rastro.
    // O agrupamento de rajada é resolvido por estado, na policy
    // `shouldGenerateReply`, exatamente para não depender desta mecânica.
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: 500,
    },
  });
  const aiReplyScheduler = new BullMqAiReplyScheduler(aiReplyQueue);

  // Feature N2 (responder pela Dashboard): produtor da fila outbound, para o
  // operador enviar pela MESMA fila da IA (consumida pelo OutboundCommandConsumer
  // dentro do apps/api). Reusa a mesma `redisConnection` — dois produtores
  // (ai-reply + whatsapp-outbound) podem compartilhar a conexão.
  //
  // CORREÇÃO 2026-08-18 (bug real observado em produção — "a IA gerou a
  // resposta mas o cliente não recebeu nada"): `OutboundCommandConsumer`
  // sempre foi documentado para propagar `WhatsAppNotConnectedError` e
  // "deixar o BullMQ aplicar retry/backoff CONFIGURADO" (ver sua própria
  // docstring, decisão D4) — mas nenhum retry jamais foi de fato configurado
  // aqui. Sem `attempts`, o BullMQ usa o default de 1 tentativa: um job que
  // cai bem no meio de uma reconexão momentânea do socket Baileys (comum,
  // segundos de duração) falhava PERMANENTEMENTE e em SILÊNCIO — o
  // `AiInteraction` já registrava `status: success` (a IA gerou a resposta
  // certinho), mas nenhuma `Message` outbound era criada, então nem o
  // cliente nem o operador viam qualquer sinal de erro. Confirmado via
  // inspeção direta da fila `bull:whatsapp-outbound:failed` no Redis: 13
  // jobs represados, todos com o mesmo `failedReason`. `attempts: 3` +
  // backoff exponencial cobre a reconexão transitória (retries em ~5s/10s);
  // uma sessão de fato offline por mais tempo que isso ainda falha ao fim
  // dos 3 tentativas — risco residual aceito, mesma categoria "at-least-once"
  // já documentada no resto desta fila. `removeOnFail: 500` espelha
  // `aiReplyQueue` acima (higiene, sem perder visibilidade de diagnóstico).
  const outboundQueue = new Queue<WhatsAppOutboundJobData>(WHATSAPP_OUTBOUND_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 500,
    },
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

  // Fase L, Bloco L1 — identidade durável de contato. O adaptador vive em
  // `services/contacts` (contexto dono da identidade) e implementa a porta
  // estreita declarada aqui em `conversations/domain` — ver `ContactResolver`.
  const contactRepository = new PrismaContactRepository(prisma);
  const contactResolver = new WhatsAppJidContactResolver(contactRepository, logger);

  // Fase L, Bloco L2 — opt-out automático por palavra-chave. Mesma
  // disposição: adaptador em `services/contacts`, porta estreita aqui.
  // Reusa `contactRepository`/`tenantRepository` já instanciados acima —
  // nenhuma conexão nova, mesma instância de `prisma`.
  const consentEventRepository = new PrismaConsentEventRepository(prisma);
  const contactConsentService = new ContactConsentService(
    contactRepository,
    consentEventRepository,
    tenantRepository,
    logger,
  );
  const optOutDetector = new KeywordOptOutDetector(contactConsentService, logger);

  const messageIngestionService = new MessageIngestionService(
    conversationRepository,
    messageRepository,
    aiReplyScheduler,
    aiAvailabilityRepository,
    aiRateLimiter,
    contactResolver,
    optOutDetector,
  );
  // Instância explícita (não o default do construtor) — precisa ser
  // RETIDA/EXPOSTA para `index.ts` injetar a MESMA nela em
  // `WhatsAppCampaignMessageSender` (ver docstring de `agentMediaCache` em
  // `ConversationsComposition`).
  const agentMediaCache = new AgentMediaCache();
  const conversationsService = new ConversationsService(
    conversationRepository,
    messageRepository,
    tenantRepository,
    auditLogRepository,
    logger,
    outboundMessageDispatcher,
    // `mediaDownloader`/`mediaSender` ficam de fora aqui de propósito (D15 —
    // injetados tardiamente por `index.ts` via setter, ver docstring do
    // construtor). `contactResolver` não tem esse problema de ordem
    // circular: já existe (linha acima) antes deste `new`.
    undefined,
    undefined,
    agentMediaCache,
    contactResolver,
  );

  return {
    conversationRepository,
    messageRepository,
    messageIngestionService,
    conversationsService,
    agentMediaCache,
    aiReplyQueue,
  };
}
