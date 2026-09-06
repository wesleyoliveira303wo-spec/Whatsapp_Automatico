import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';
import { RequestWithPrincipal } from '../../../shared/presentation/authenticate';
import { hasPermission } from '../../auth/domain/permissions';
import { TenantAccessRequest } from '../domain/entities/TenantAccessRequest';
import { SupportAccessService } from '../application/SupportAccessService';

const idParamSchema = z.object({ id: z.string().trim().min(1) });
const respondBodySchema = z.object({ decision: z.enum(['accept', 'deny']) });

/**
 * Lado TENANT do acesso assistido — Fase 5. `/api/tenants/:tenantId/support-access/*`,
 * montado ATRÁS do `authenticate` (ver `index.ts`).
 *
 * **Isolamento por construção:** toda chamada ao `SupportAccessService` passa
 * `tenantId: req.params.tenantId` (o mesmo que o `authenticate` já casou
 * contra o crachá — `tenantMatches`), e o service reconfere que o pedido
 * pertence a esse tenant antes de qualquer escrita. Nenhuma consulta aqui
 * cruza a fronteira do tenant — este router NÃO é código cross-tenant, apesar
 * de o `SupportAccessService` viver em `services/platform` (dono do conceito).
 *
 * `GET /active` só exige estar autenticado (o banner precisa aparecer para
 * qualquer usuário do tenant). Responder/revogar exige um ATOR HUMANO com
 * `support:respond` (só `owner`/`administrator`, §9.1).
 */
export function createTenantSupportAccessRouter(service: SupportAccessService): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/active',
    asyncHandler(async (req, res) => {
      const tenantId = req.params.tenantId;
      const open = await service.getOpenForTenant(tenantId);
      const principal = (req as RequestWithPrincipal).principal;
      const canRespond =
        !!principal &&
        (principal.kind === 'machine' ||
          principal.kind === 'support' ||
          (principal.kind === 'user' && hasPermission(principal.role, 'support:respond')));
      res.status(200).json({
        canRespond,
        open: open
          ? {
              ...serialize(open.request),
              adminName: open.adminName,
              adminEmail: open.adminEmail,
            }
          : null,
      });
    }),
  );

  router.post(
    '/:id/respond',
    requireHumanActor,
    requirePermission('support:respond'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(idParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(respondBodySchema, req.body, res);
      if (!body) return;

      const updated = await service.respond(
        {
          tenantId: req.params.tenantId,
          supportAccessId: params.id,
          respondedByUserId: humanUserId(req),
          decision: body.decision,
        },
        meta(req),
      );
      res.status(200).json({ request: serialize(updated) });
    }),
  );

  router.post(
    '/:id/revoke',
    requireHumanActor,
    requirePermission('support:respond'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(idParamSchema, req.params, res);
      if (!params) return;

      const updated = await service.revoke(
        {
          tenantId: req.params.tenantId,
          supportAccessId: params.id,
          revokedByUserId: humanUserId(req),
        },
        meta(req),
      );
      res.status(200).json({ request: serialize(updated) });
    }),
  );

  return router;
}

/** Só uma PESSOA identificável responde a um pedido de acesso — nunca a API key. */
function requireHumanActor(req: Request, res: Response, next: NextFunction): void {
  const principal = (req as RequestWithPrincipal).principal;
  if (!principal || principal.kind !== 'user') {
    res.status(403).json({
      error: 'human_required',
      message: 'Autorizar acesso de suporte exige login de pessoa.',
    });
    return;
  }
  next();
}

function humanUserId(req: Request): string {
  const principal = (req as RequestWithPrincipal).principal as Extract<
    NonNullable<RequestWithPrincipal['principal']>,
    { kind: 'user' }
  >;
  return principal.userId;
}

function meta(req: Request): { ip?: string; userAgent?: string } {
  const ua = req.headers['user-agent'];
  return { ip: req.ip, userAgent: typeof ua === 'string' ? ua : undefined };
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
