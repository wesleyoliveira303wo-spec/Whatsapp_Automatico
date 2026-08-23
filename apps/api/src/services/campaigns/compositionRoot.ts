import type { PrismaClient } from '@prisma/client';
import type { Router, ErrorRequestHandler } from 'express';
import { Queue, Worker } from 'bullmq';
import type IORedis from 'ioredis';

import { Logger } from '../../shared/domain/Logger';
import { PrismaTenantRepository } from '../../shared/tenant/infrastructure/PrismaTenantRepository';
import { PrismaCampaignRepository } from './infrastructure/repositories/PrismaCampaignRepository';
import { CampaignRepository } from './domain/repositories/CampaignRepository';
import { CampaignMessageSender } from './domain/providers/CampaignMessageSender';
import { ContactLookup } from './domain/ports/ContactLookup';
import { CampaignService } from './application/CampaignService';
import { createCampaignsRouter } from './presentation/campaignsRouter';
import { createCampaignsErrorHandler } from './presentation/campaignsErrorHandler';
import { BullMqCampaignSendDispatcher } from './infrastructure/dispatchers/BullMqCampaignSendDispatcher';
import { CampaignSendJobProcessor } from './infrastructure/CampaignSendJobProcessor';
import {
  CAMPAIGN_SEND_QUEUE_NAME,
  CampaignSendJobData,
} from './infrastructure/queues/CampaignSendQueue';

/**
 * Composition root do bounded context `campaigns` (Fase L, Blocos L3/L4).
 * Mesmo racional de `createContactsComposition`/`createTagsComposition`: CRUD
 * autocontido sobre Postgres — sem dependência de Redis para EXISTIR —,
 * então montado nos DOIS ramos de `mountWhatsAppSessionsRoutes()` em
 * `index.ts`.
 *
 * O motor de envio (L4: fila `campaign-send`, `CampaignMessageSender`) é
 * OPCIONAL e sempre injetado DEPOIS, só no ramo completo (com `REDIS_URL` E
 * `WhatsAppConnectionRegistry` disponíveis) — ver `wireCampaignSendEngine`.
 * Sem essa injeção, `campaignService.startCampaign()` recusa com um erro
 * claro (`SendingEngineNotConfiguredError`), mas toda leitura/criação (L3)
 * continua funcionando normalmente.
 */
export interface CampaignsComposition {
  campaignRepository: CampaignRepository;
  campaignService: CampaignService;
  campaignsRouter: Router;
  campaignsErrorHandler: ErrorRequestHandler;
}

export function createCampaignsComposition(
  prisma: PrismaClient,
  logger: Logger,
  /**
   * Reorganização Contatos/Campanhas (2026-08-17) — OPCIONAL (mesmo padrão do
   * resto desta composição): quem monta (`index.ts`) já cria `contacts`
   * ANTES de `campaigns`, então normalmente está sempre presente; ausente só
   * degrada (telefones de planilha/manual nunca "viram" Contato existente),
   * nunca quebra.
   */
  contactLookup?: ContactLookup,
): CampaignsComposition {
  const campaignRepository = new PrismaCampaignRepository(prisma);
  const tenantRepository = new PrismaTenantRepository(prisma);

  const campaignService = new CampaignService(
    campaignRepository,
    tenantRepository,
    logger,
    undefined,
    contactLookup,
  );
  const campaignsRouter = createCampaignsRouter(campaignService);
  const campaignsErrorHandler = createCampaignsErrorHandler(logger);

  return { campaignRepository, campaignService, campaignsRouter, campaignsErrorHandler };
}

/**
 * Liga o motor de envio (L4) a uma composição `campaigns` já criada — injeta
 * o dispatcher (produtor) no `CampaignService` (injeção tardia, mesmo padrão
 * de `ConversationsService.setMediaSender`) e sobe o `Worker` consumidor da
 * fila `campaign-send`, dentro de `apps/api` (único dono dos sockets, ADR
 * #54).
 *
 * Recebe `campaignMessageSender` já pronto (construído em `index.ts`, que é
 * o único lugar com `WhatsAppConnectionRegistry` E os repositórios de
 * `conversations` simultaneamente em escopo) — este composition root não o
 * constrói, só o consome.
 */
export function wireCampaignSendEngine(
  composition: CampaignsComposition,
  campaignMessageSender: CampaignMessageSender,
  redisConnection: IORedis,
  logger: Logger,
): Worker<CampaignSendJobData> {
  const queue = new Queue<CampaignSendJobData>(CAMPAIGN_SEND_QUEUE_NAME, {
    connection: redisConnection,
  });
  const dispatcher = new BullMqCampaignSendDispatcher(queue);
  composition.campaignService.setCampaignSendDispatcher(dispatcher);

  const processor = new CampaignSendJobProcessor(
    composition.campaignRepository,
    campaignMessageSender,
    logger,
  );

  const worker = new Worker<CampaignSendJobData>(
    CAMPAIGN_SEND_QUEUE_NAME,
    async (job) => {
      await processor.process(job.data);
    },
    {
      connection: redisConnection,
      // CORREÇÃO 2026-08-18 (achado real: retomar/reabrir uma campanha nunca
      // reagendava ninguém — ver docstring de `BullMqCampaignSendDispatcher`
      // para o diagnóstico completo). `{ count: 1000 }` PARECIA "liberar o
      // jobId", mas no volume real de envios de campanha isso nunca evict
      // nada na prática — o jobId ficava preso indefinidamente. `{ count: 0 }`
      // remove o job assim que ele completa (equivalente, para `WorkerOptions`,
      // do `removeOnComplete: true` já usado nas filas `ai-reply`/
      // `whatsapp-outbound` — `WorkerOptions` só aceita a forma `KeepJobs`
      // aqui, diferente de `JobOptions`, que aceita `boolean`). A garantia de
      // correção de verdade agora mora em
      // `BullMqCampaignSendDispatcher.scheduleRecipient` (remove
      // explicitamente antes de reagendar); isto aqui é só higiene.
      removeOnComplete: { count: 0 },
      // Falhas continuam retidas (diagnóstico) — reagendar depois de uma
      // falha funciona porque o dispatcher remove o job antigo antes.
      removeOnFail: { count: 500 },
    },
  );

  worker.on('completed', (job) => {
    logger.info('Job campaign-send concluído', { jobId: job.id });
  });
  worker.on('failed', (job, error) => {
    logger.error('Job campaign-send falhou', { jobId: job?.id, error });
  });

  return worker;
}
