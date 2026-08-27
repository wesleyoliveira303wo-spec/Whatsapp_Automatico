import { Router } from 'express';
import { z } from 'zod';
import { TenantRepository } from '../domain/TenantRepository';
import { requirePermission } from '../../presentation/requirePermission';
import { asyncHandler, validateOrRespond } from '../../presentation/httpHelpers';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId nao pode ser vazio'),
});
const updateTenantBodySchema = z.object({
  name: z.string().trim().min(1, 'name nao pode ser vazio').max(200),
});

/**
 * Router da aba "Empresa" de Configuracoes (Reorganizacao Perfil/
 * Configuracoes, 2026-08-27) — hoje so o nome do tenant, unico dado de
 * `Tenant` com consumidor de UI. Montado em `/api/tenants/:tenantId`, atras
 * de `authenticate` (aceita PESSOA ou MAQUINA, igual as demais rotas de
 * tenant): GET e liberado a qualquer principal autenticado do tenant;
 * PATCH exige `tenant:manage` (hoje so OWNER — ver `permissions.ts`), edicao
 * do nome da empresa e acao de dono, nao de qualquer membro da equipe.
 */
export function createTenantRouter(tenantRepository: TenantRepository): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;

      const tenant = await tenantRepository.findById(params.tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'tenant_not_found' });
        return;
      }
      res.status(200).json({ tenant: { id: tenant.id, name: tenant.name } });
    }),
  );

  router.patch(
    '/',
    requirePermission('tenant:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(updateTenantBodySchema, req.body, res);
      if (!body) return;

      const tenant = await tenantRepository.update(params.tenantId, { name: body.name });
      if (!tenant) {
        res.status(404).json({ error: 'tenant_not_found' });
        return;
      }
      res.status(200).json({ tenant: { id: tenant.id, name: tenant.name } });
    }),
  );

  return router;
}
