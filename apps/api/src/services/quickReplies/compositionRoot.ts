import type { PrismaClient } from '@prisma/client';
import type { Router, ErrorRequestHandler } from 'express';

import { Logger } from '../../shared/domain/Logger';
import { PrismaTenantRepository } from '../../shared/tenant/infrastructure/PrismaTenantRepository';
import { PrismaQuickReplyRepository } from './infrastructure/repositories/PrismaQuickReplyRepository';
import { QuickReplyRepository } from './domain/repositories/QuickReplyRepository';
import { QuickReplyService } from './application/QuickReplyService';
import { createQuickReplyRouter } from './presentation/quickReplyRouter';
import { createQuickReplyErrorHandler } from './presentation/quickReplyErrorHandler';

/**
 * Composition root do bounded context `quickReplies` (Fase 1, Bloco F1.9).
 * Responsabilidade única: instanciar `PrismaQuickReplyRepository`
 * (Infrastructure), o `QuickReplyService` (Application) e montar o router +
 * error handler (Presentation). Nenhuma regra de negócio, nenhum SQL.
 *
 * Não recebe conexão Redis/BullMQ: respostas rápidas são um CRUD autocontido
 * sobre Postgres, sem fila — mesmo racional de `createAnalyticsComposition`
 * (`services/analytics/compositionRoot.ts`), por isso é montado nos DOIS
 * ramos de `mountWhatsAppSessionsRoutes()` em `index.ts` (degradado sem
 * Redis, e completo).
 */
export interface QuickRepliesComposition {
  quickReplyRepository: QuickReplyRepository;
  quickReplyService: QuickReplyService;
  quickReplyRouter: Router;
  quickReplyErrorHandler: ErrorRequestHandler;
}

export function createQuickRepliesComposition(
  prisma: PrismaClient,
  logger: Logger,
): QuickRepliesComposition {
  const quickReplyRepository = new PrismaQuickReplyRepository(prisma);
  const tenantRepository = new PrismaTenantRepository(prisma);

  const quickReplyService = new QuickReplyService(quickReplyRepository, tenantRepository, logger);

  const quickReplyRouter = createQuickReplyRouter(quickReplyService);
  const quickReplyErrorHandler = createQuickReplyErrorHandler(logger);

  return { quickReplyRepository, quickReplyService, quickReplyRouter, quickReplyErrorHandler };
}
