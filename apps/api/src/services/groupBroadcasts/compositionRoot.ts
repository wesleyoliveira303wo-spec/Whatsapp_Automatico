import type { PrismaClient } from '@prisma/client';
import type { ErrorRequestHandler, Router } from 'express';
import { Queue, Worker } from 'bullmq';
import type IORedis from 'ioredis';

import { Logger } from '../../shared/domain/Logger';
import { PrismaTenantRepository } from '../../shared/tenant/infrastructure/PrismaTenantRepository';
import { PrismaAuditLogRepository } from '../auth/infrastructure/repositories/PrismaAuditLogRepository';
import { GroupBroadcastService } from './application/GroupBroadcastService';
import { GroupBroadcastRepository } from './domain/repositories/GroupBroadcastRepository';
import { GroupDirectory } from './domain/providers/GroupDirectory';
import { GroupMessageSender } from './domain/providers/GroupMessageSender';
import { PrismaGroupBroadcastRepository } from './infrastructure/repositories/PrismaGroupBroadcastRepository';
import { BullMqGroupBroadcastSendDispatcher } from './infrastructure/dispatchers/BullMqGroupBroadcastSendDispatcher';
import { GroupBroadcastSendJobProcessor } from './infrastructure/GroupBroadcastSendJobProcessor';
import { GroupBroadcastRunJobProcessor } from './infrastructure/GroupBroadcastRunJobProcessor';
import {
  GROUP_BROADCAST_RUN_JOB_NAME,
  GROUP_BROADCAST_SEND_QUEUE_NAME,
  GroupBroadcastRunJobData,
  GroupBroadcastSendJobData,
} from './infrastructure/queues/GroupBroadcastSendQueue';
import { createGroupBroadcastsRouter } from './presentation/groupBroadcastsRouter';
import { createGroupBroadcastsErrorHandler } from './presentation/groupBroadcastsErrorHandler';

/**
 * Composition root do bounded context `groupBroadcasts` (Disparos em grupos,
 * 2026-09-11). Mesmo desenho de `createCampaignsComposition`: CRUD sobre
 * Postgres que existe sem Redis (montado nos dois ramos de `index.ts`), com o
 * motor de envio ligado DEPOIS, só no ramo completo (`wireGroupBroadcastSendEngine`).
 *
 * Recebe `groupDirectory` pronto — é um adapter de `services/whatsapp`
 * (depende do `registry`), então quem monta é `index.ts`, não este arquivo.
 */
export interface GroupBroadcastsComposition {
  repository: GroupBroadcastRepository;
  service: GroupBroadcastService;
  router: Router;
  errorHandler: ErrorRequestHandler;
}

export function createGroupBroadcastsComposition(
  prisma: PrismaClient,
  logger: Logger,
  groupDirectory: GroupDirectory,
): GroupBroadcastsComposition {
  const repository = new PrismaGroupBroadcastRepository(prisma);
  const service = new GroupBroadcastService(
    repository,
    new PrismaTenantRepository(prisma),
    groupDirectory,
    logger,
    undefined,
    new PrismaAuditLogRepository(prisma),
  );
  return {
    repository,
    service,
    router: createGroupBroadcastsRouter(service),
    errorHandler: createGroupBroadcastsErrorHandler(logger),
  };
}

/**
 * Liga o motor de envio: dispatcher (produtor) injetado no serviço + `Worker`
 * consumidor da fila `group-broadcast-send`, DENTRO de `apps/api` (único dono
 * dos sockets, ADR #54). Mesma política de retenção corrigida em
 * `wireCampaignSendEngine` (2026-08-18): `removeOnComplete: { count: 0 }` — um
 * job concluído nunca segura o `jobId` (a garantia de verdade, porém, é o
 * `remove` antes do `add` no dispatcher).
 *
 * `concurrency` default (1): os envios já são espaçados por dezenas de
 * segundos; processar dois grupos ao mesmo tempo só aumentaria o risco.
 */
export function wireGroupBroadcastSendEngine(
  composition: GroupBroadcastsComposition,
  sender: GroupMessageSender,
  redisConnection: IORedis,
  logger: Logger,
): Worker<GroupBroadcastSendJobData | GroupBroadcastRunJobData> {
  const queue = new Queue<GroupBroadcastSendJobData | GroupBroadcastRunJobData>(
    GROUP_BROADCAST_SEND_QUEUE_NAME,
    { connection: redisConnection },
  );
  const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue);
  composition.service.setSendDispatcher(dispatcher);

  const processor = new GroupBroadcastSendJobProcessor(
    composition.repository,
    sender,
    logger,
    dispatcher,
  );
  // Recorrência (2026-09-11): segundo tipo de job na MESMA fila — o ciclo que
  // reabre o disparo. Ver `GroupBroadcastRunJobProcessor`.
  const runProcessor = new GroupBroadcastRunJobProcessor(
    composition.repository,
    dispatcher,
    logger,
  );

  const worker = new Worker<GroupBroadcastSendJobData | GroupBroadcastRunJobData>(
    GROUP_BROADCAST_SEND_QUEUE_NAME,
    async (job) => {
      if (job.name === GROUP_BROADCAST_RUN_JOB_NAME) {
        await runProcessor.process(job.data as GroupBroadcastRunJobData);
        return;
      }
      await processor.process(job.data as GroupBroadcastSendJobData);
    },
    {
      connection: redisConnection,
      removeOnComplete: { count: 0 },
      removeOnFail: { count: 500 },
    },
  );

  worker.on('completed', (job) => {
    logger.info('Job group-broadcast-send concluído', { jobId: job.id });
  });
  worker.on('failed', (job, error) => {
    logger.error('Job group-broadcast-send falhou', { jobId: job?.id, error });
  });

  return worker;
}
