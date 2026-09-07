import { Router, RequestHandler } from 'express';
import { z } from 'zod';

import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { Tenant } from '../../../shared/tenant/domain/Tenant';
import {
  TenantDetailRow,
  TenantListRow,
  TenantObservabilityService,
} from '../application/TenantObservabilityService';
import { TenantControlService } from '../application/TenantControlService';
import { RequestWithPlatformUser } from './requirePlatformUser';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});

const changePlanBodySchema = z.object({
  plan: z.enum(['free', 'pro', 'enterprise']),
});

/**
 * Centro de Tenants do `/admin` — Fase 2 (`ADMIN_PLATFORM_MASTER_PLAN.md` §6).
 *
 * Thin router (D18): sem regra de negócio, só serialização e HTTP. Montado
 * atrás de `requirePlatformUser` — toda rota daqui exige sessão de plataforma
 * válida, relida do banco a cada requisição (Fase 1).
 *
 * As leituras (`GET`) NÃO são auditadas — abrir uma tela de observação não é
 * uma ação. As ESCRITAS da Fase 4 (`PATCH .../plan`, `POST .../suspend`,
 * `.../reactivate`) são auditadas ANTES de executar, dentro do
 * `TenantControlService` — o router só extrai ator/ip/user-agent e serializa.
 */
export function createPlatformTenantsRouter(
  service: TenantObservabilityService,
  requirePlatformUser: RequestHandler,
  controlService: TenantControlService,
): Router {
  const router = Router();

  /** Ator + origem da requisição, para a trilha da plataforma. */
  function controlContext(req: Parameters<RequestHandler>[0]): {
    actorId: string;
    ip?: string;
    userAgent?: string;
  } {
    const actorId = (req as RequestWithPlatformUser).platformUser?.id ?? 'unknown';
    const userAgent = req.headers['user-agent'];
    return { actorId, ip: req.ip, userAgent: typeof userAgent === 'string' ? userAgent : undefined };
  }

  router.get(
    '/tenants',
    requirePlatformUser,
    asyncHandler(async (_req, res) => {
      const rows = await service.listTenants();
      res.status(200).json({ tenants: rows.map(serializeListRow) });
    }),
  );

  router.get(
    '/tenants/:tenantId',
    requirePlatformUser,
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;

      const row = await service.getTenant(params.tenantId);
      if (!row) {
        res.status(404).json({ error: 'tenant_not_found' });
        return;
      }

      res.status(200).json({ tenant: serializeDetailRow(row) });
    }),
  );

  // ----- Fase 4 — Controle (§8). Escritas cross-tenant, auditadas. -----
  //
  // Não há atalho: cada rota exige o mesmo `requirePlatformUser` das leituras,
  // não aceita nenhum parâmetro "forçar", e a confirmação forte de "suspender"
  // é da UI. Uma chamada direta à API a `.../suspend` faz exatamente o que o
  // botão faz — auditar e suspender —, nunca menos (§15: "confirmação forte
  // não é contornável por chamada direta" = não existe caminho privilegiado
  // que pule a auditoria).

  router.patch(
    '/tenants/:tenantId/plan',
    requirePlatformUser,
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(changePlanBodySchema, req.body, res);
      if (!body) return;

      const tenant = await controlService.changePlan(
        params.tenantId,
        body.plan,
        controlContext(req),
      );
      res.status(200).json({ tenant: serializeControlResult(tenant) });
    }),
  );

  router.post(
    '/tenants/:tenantId/suspend',
    requirePlatformUser,
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;

      const tenant = await controlService.suspend(params.tenantId, controlContext(req));
      res.status(200).json({ tenant: serializeControlResult(tenant) });
    }),
  );

  router.post(
    '/tenants/:tenantId/reactivate',
    requirePlatformUser,
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;

      const tenant = await controlService.reactivate(params.tenantId, controlContext(req));
      res.status(200).json({ tenant: serializeControlResult(tenant) });
    }),
  );

  return router;
}

/** O tenant depois de uma ação de controle — só os campos que a ação mexe. */
function serializeControlResult(tenant: Tenant): Record<string, unknown> {
  return { id: tenant.id, name: tenant.name, plan: tenant.plan, status: tenant.status };
}

/**
 * `Date` → ISO string, `signals` achatados. `costUsd` fica STRING (D46 — nunca
 * `Number()`). O que a UI recebe é JSON puro, sem `Date` nem `Decimal`.
 */
function serializeListRow(row: TenantListRow): Record<string, unknown> {
  const t = row.tenant;
  return {
    id: t.id,
    name: t.name,
    plan: t.plan,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    sessionCount: t.sessionCount,
    connectedSessionCount: t.connectedSessionCount,
    userCount: t.userCount,
    lastActivityAt: t.lastActivityAt ? t.lastActivityAt.toISOString() : null,
    messages30d: t.messages30d,
    ai30d: t.ai30d,
    conversations30d: t.conversations30d,
    aiProfileConfigured: t.aiProfileConfigured,
    signals: row.signals,
  };
}

function serializeDetailRow(row: TenantDetailRow): Record<string, unknown> {
  const t = row.tenant;
  return {
    ...serializeListRow({ tenant: t, signals: row.signals }),
    contactCount: t.contactCount,
    campaigns: t.campaigns,
    sessions: t.sessions.map((s) => ({
      sessionName: s.sessionName,
      status: s.status,
      phoneNumber: s.phoneNumber,
      lastSeen: s.lastSeen ? s.lastSeen.toISOString() : null,
      aiProfileConfigured: s.aiProfileConfigured,
    })),
    recentSessionEvents: t.recentSessionEvents.map((e) => ({
      sessionName: e.sessionName,
      status: e.status,
      disconnectReason: e.disconnectReason,
      occurredAt: e.occurredAt.toISOString(),
    })),
  };
}
