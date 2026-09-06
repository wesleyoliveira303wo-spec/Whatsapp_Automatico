import { Router, RequestHandler } from 'express';
import { z } from 'zod';

import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import {
  TenantDetailRow,
  TenantListRow,
  TenantObservabilityService,
} from '../application/TenantObservabilityService';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});

/**
 * Centro de Tenants do `/admin` — Fase 2 (`ADMIN_PLATFORM_MASTER_PLAN.md` §6).
 *
 * Thin router (D18): sem regra de negócio, só serialização e HTTP. Montado
 * atrás de `requirePlatformUser` — toda rota daqui exige sessão de plataforma
 * válida, relida do banco a cada requisição (Fase 1).
 *
 * SÓ LEITURA — nenhuma destas rotas é auditada. A trilha (`PlatformAuditLog`)
 * é para AÇÕES sobre um tenant (§8), que são da Fase 4; abrir uma tela de
 * observação não é uma ação. Mesmo critério de `auditLogRouter` no produto,
 * que também não audita as próprias leituras.
 */
export function createPlatformTenantsRouter(
  service: TenantObservabilityService,
  requirePlatformUser: RequestHandler,
): Router {
  const router = Router();

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

  return router;
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
