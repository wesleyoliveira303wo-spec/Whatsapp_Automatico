import { Router, RequestHandler } from 'express';
import { z } from 'zod';

import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { PlatformSearchService } from '../application/PlatformSearchService';

const querySchema = z.object({
  q: z.string().trim().max(200).optional().default(''),
});

/**
 * Busca global do `/admin` — Fase 6 (§7). `GET /api/platform/search?q=`,
 * atrás do MESMO `requirePlatformUser`. Só leitura, não auditada (observar não
 * é agir). Consulta curta/vazia devolve grupos vazios — o service decide.
 */
export function createPlatformSearchRouter(
  service: PlatformSearchService,
  requirePlatformUser: RequestHandler,
): Router {
  const router = Router();

  router.get(
    '/search',
    requirePlatformUser,
    asyncHandler(async (req, res) => {
      const query = validateOrRespond(querySchema, req.query, res);
      if (!query) return;
      const results = await service.search(query.q);
      res.status(200).json(results);
    }),
  );

  return router;
}
