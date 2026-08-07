import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';
import { AuditLogService, MAX_AUDIT_LOG_LIST_LIMIT } from '../application/AuditLogService';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId nao pode ser vazio'),
});

// `limit` opcional no schema, default aplicado no Service (mesmo motivo já
// documentado em `usersRouter.ts` — `validateOrRespond` exige `z.ZodSchema<T>`
// com input=output, que não representa `.default()`).
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_AUDIT_LOG_LIST_LIMIT).optional(),
  cursor: z.string().trim().min(1).optional(),
  actorUserId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
});

/**
 * Router do painel de auditoria (Fase 1, Bloco F1.5) — thin router (D18):
 * Zod + chamada ao `AuditLogService` + resposta HTTP, mesmo padrão de
 * `usersRouter.ts`. Só leitura (`GET /`) — `record()` é chamado
 * internamente pelos próprios bounded contexts (`AuthService`,
 * `UserManagementService`, `ConversationsService`, `WhatsAppSessionService`),
 * nunca via HTTP. Montado em `/api/tenants/:tenantId/audit-logs`, atrás de
 * `authenticate` (ver `index.ts`) — protegido por `requirePermission
 * ('audit:read')`, permissão já existente no catálogo desde a M5A (nível
 * MANAGER, herdada por ADMINISTRATOR/OWNER — decisão do fundador de
 * 2026-07-31: seguir o RBAC já existente em vez de restringir só a
 * administrator/owner). Igual a toda rota atrás de `requirePermission`, o
 * plano MÁQUINA (API key do tenant) libera tudo por padrão
 * (`requirePermission.ts`) — não é uma decisão específica desta rota.
 *
 * Sem error handler dedicado (diferente de `usersRouter`/`conversationsRouter`):
 * `listByTenant` é uma leitura pura, sem erro de Domain esperado — um 500
 * genérico do error handler global do `index.ts` já cobre qualquer falha
 * inesperada (ex.: banco fora do ar).
 */
export function createAuditLogRouter(auditLogService: AuditLogService): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    requirePermission('audit:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const query = validateOrRespond(listQuerySchema, req.query, res);
      if (!query) return;

      const page = await auditLogService.listAuditLogs(params.tenantId, query);
      res.status(200).json(page);
    }),
  );

  return router;
}
