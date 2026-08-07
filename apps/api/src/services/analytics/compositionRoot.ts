import type { PrismaClient } from '@prisma/client';
import type { Router, ErrorRequestHandler } from 'express';

import { Logger } from '../../shared/domain/Logger';
import { PrismaTenantRepository } from '../../shared/tenant/infrastructure/PrismaTenantRepository';
import { PrismaAnalyticsRepository } from './infrastructure/repositories/PrismaAnalyticsRepository';
import { AnalyticsRepository } from './domain/repositories/AnalyticsRepository';
import { AnalyticsService } from './application/AnalyticsService';
import { createAnalyticsRouter } from './presentation/analyticsRouter';
import { createAnalyticsErrorHandler } from './presentation/analyticsErrorHandler';

/**
 * Composition root do bounded context `analytics` (Milestone 4, Bloco M4C —
 * ADR #59). Responsabilidade unica: instanciar `PrismaAnalyticsRepository`
 * (Infrastructure), o `AnalyticsService` (Application) e montar o router +
 * error handler (Presentation). Nenhuma regra de negocio, nenhum SQL.
 *
 * Nao recebe conexao Redis/BullMQ: Analytics e read-only sobre Postgres
 * (D51) — nao produz nem consome fila. Espelha `createAiComposition` (que
 * tambem so serve leitura REST), estendido para tambem devolver o router e o
 * error handler ja montados (o wiring em `index.ts` so os monta no path).
 */
export interface AnalyticsComposition {
  analyticsRepository: AnalyticsRepository;
  analyticsService: AnalyticsService;
  analyticsRouter: Router;
  analyticsErrorHandler: ErrorRequestHandler;
}

export function createAnalyticsComposition(
  prisma: PrismaClient,
  logger: Logger,
): AnalyticsComposition {
  const analyticsRepository = new PrismaAnalyticsRepository(prisma);
  const tenantRepository = new PrismaTenantRepository(prisma);

  const analyticsService = new AnalyticsService(analyticsRepository, tenantRepository, logger);

  const analyticsRouter = createAnalyticsRouter(analyticsService);
  const analyticsErrorHandler = createAnalyticsErrorHandler(logger);

  return { analyticsRepository, analyticsService, analyticsRouter, analyticsErrorHandler };
}
