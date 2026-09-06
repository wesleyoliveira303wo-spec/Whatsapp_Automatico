import { Router, RequestHandler, Request } from 'express';
import { z } from 'zod';

import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { TenantAccessRequest } from '../domain/entities/TenantAccessRequest';
import { SupportAccessService } from '../application/SupportAccessService';
import { RequestWithPlatformUser } from './requirePlatformUser';

const requestBodySchema = z.object({
  tenantId: z.string().trim().min(1),
  reason: z.string().trim().min(1, 'Escreva um motivo.').max(500),
});

const idParamSchema = z.object({
  id: z.string().trim().min(1),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().trim().min(1).optional(),
});

const DEFAULT_LIST_LIMIT = 30;

/**
 * Lado ADMIN do acesso assistido — Painel `/admin`, Fase 5 (§9.5).
 * `/api/platform/support/*`, atrás do MESMO `requirePlatformUser` das demais
 * rotas de plataforma. As transições de estado são auditadas pelo
 * `SupportAccessService`; o router é fino (Zod + serialização).
 */
export function createPlatformSupportRouter(
  service: SupportAccessService,
  requirePlatformUser: RequestHandler,
): Router {
  const router = Router();

  function meta(req: Request): { ip?: string; userAgent?: string } {
    const ua = req.headers['user-agent'];
    return { ip: req.ip, userAgent: typeof ua === 'string' ? ua : undefined };
  }

  function adminId(req: Request): string {
    return (req as RequestWithPlatformUser).platformUser?.id ?? 'unknown';
  }

  // Pedir acesso a um tenant.
  router.post(
    '/support',
    requirePlatformUser,
    asyncHandler(async (req, res) => {
      const body = validateOrRespond(requestBodySchema, req.body, res);
      if (!body) return;
      const created = await service.request(
        { tenantId: body.tenantId, platformUserId: adminId(req), reason: body.reason },
        meta(req),
      );
      res.status(201).json({ request: serialize(created) });
    }),
  );

  // Seção Suporte: pendentes / ativos / expirados / recusados / histórico.
  router.get(
    '/support',
    requirePlatformUser,
    asyncHandler(async (req, res) => {
      const query = validateOrRespond(listQuerySchema, req.query, res);
      if (!query) return;
      const page = await service.listForAdmin(query.limit ?? DEFAULT_LIST_LIMIT, query.cursor);
      res.status(200).json({
        requests: page.requests.map(serialize),
        nextCursor: page.nextCursor ?? null,
      });
    }),
  );

  // Emitir o crachá de acesso (o BFF grava a sessão de suporte com ele).
  router.post(
    '/support/:id/token',
    requirePlatformUser,
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(idParamSchema, req.params, res);
      if (!params) return;
      const result = await service.mintToken({
        supportAccessId: params.id,
        platformUserId: adminId(req),
      });
      res.status(200).json({
        token: result.token,
        expiresAt: result.expiresAt.toISOString(),
        tenantId: result.tenantId,
        platformUserId: result.platformUserId,
      });
    }),
  );

  // O admin sai da conta.
  router.post(
    '/support/:id/end',
    requirePlatformUser,
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(idParamSchema, req.params, res);
      if (!params) return;
      const ended = await service.end(
        { supportAccessId: params.id, platformUserId: adminId(req) },
        meta(req),
      );
      res.status(200).json({ request: serialize(ended) });
    }),
  );

  return router;
}

function serialize(r: TenantAccessRequest): Record<string, unknown> {
  return {
    id: r.id,
    tenantId: r.tenantId,
    platformUserId: r.platformUserId,
    reason: r.reason,
    status: r.status,
    requestedAt: r.requestedAt.toISOString(),
    respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
    respondedByUserId: r.respondedByUserId,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  };
}
