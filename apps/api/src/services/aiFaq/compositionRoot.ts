import type { PrismaClient } from '@prisma/client';
import type { Router, ErrorRequestHandler } from 'express';

import { Logger } from '../../shared/domain/Logger';
import { PrismaTenantRepository } from '../../shared/tenant/infrastructure/PrismaTenantRepository';
import { PrismaAiFaqRepository } from './infrastructure/repositories/PrismaAiFaqRepository';
import { AiFaqRepository } from './domain/repositories/AiFaqRepository';
import { AiFaqService } from './application/AiFaqService';
import { createAiFaqRouter } from './presentation/aiFaqRouter';
import { createAiFaqErrorHandler } from './presentation/aiFaqErrorHandler';

/**
 * Composition root do bounded context `aiFaq` (Cérebro da IA v3, Fase 2).
 * Responsabilidade única: instanciar `PrismaAiFaqRepository`
 * (Infrastructure), o `AiFaqService` (Application) e montar o router + error
 * handler (Presentation). Nenhuma regra de negócio, nenhum SQL.
 *
 * CRUD autocontido sobre Postgres, sem fila — mesmo racional de
 * `createQuickRepliesComposition` — por isso é montado nos DOIS ramos de
 * `mountWhatsAppSessionsRoutes()` em `index.ts` (degradado sem Redis, e
 * completo).
 */
export interface AiFaqComposition {
  aiFaqRepository: AiFaqRepository;
  aiFaqService: AiFaqService;
  aiFaqRouter: Router;
  aiFaqErrorHandler: ErrorRequestHandler;
}

export function createAiFaqComposition(prisma: PrismaClient, logger: Logger): AiFaqComposition {
  const aiFaqRepository = new PrismaAiFaqRepository(prisma);
  const tenantRepository = new PrismaTenantRepository(prisma);

  const aiFaqService = new AiFaqService(aiFaqRepository, tenantRepository, logger);

  const aiFaqRouter = createAiFaqRouter(aiFaqService);
  const aiFaqErrorHandler = createAiFaqErrorHandler(logger);

  return { aiFaqRepository, aiFaqService, aiFaqRouter, aiFaqErrorHandler };
}
