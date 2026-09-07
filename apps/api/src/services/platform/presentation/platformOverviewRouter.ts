import { Router, RequestHandler } from 'express';

import { asyncHandler } from '../../../shared/presentation/httpHelpers';
import { PlatformOverviewService } from '../application/PlatformOverviewService';
import { PlatformHealthService } from '../application/PlatformHealthService';

/**
 * Início + Saúde do `/admin` — Fase 3 (`ADMIN_PLATFORM_MASTER_PLAN.md` §5, §15).
 *
 * Thin router (D18), atrás de `requirePlatformUser`, só leitura, não auditado
 * (mesmo critério do `platformTenantsRouter`: observar não é agir).
 *
 * O JSON já sai serializável (números, strings, `null`) das duas Application
 * Services — `costUsd` continua STRING (D46). Não há `Date` nestes dois
 * payloads, então não há o que converter.
 */
export function createPlatformOverviewRouter(
  overviewService: PlatformOverviewService,
  healthService: PlatformHealthService,
  requirePlatformUser: RequestHandler,
): Router {
  const router = Router();

  router.get(
    '/overview',
    requirePlatformUser,
    asyncHandler(async (_req, res) => {
      res.status(200).json(await overviewService.getOverview());
    }),
  );

  router.get(
    '/health',
    requirePlatformUser,
    asyncHandler(async (_req, res) => {
      res.status(200).json(await healthService.getHealth());
    }),
  );

  return router;
}
