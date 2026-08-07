import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';

import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';
import { RequestWithPrincipal } from '../../../shared/presentation/authenticate';
import { UserManagementActor, UserManagementService } from '../application/UserManagementService';
import { AuthRequestMeta } from '../application/AuthService';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId nao pode ser vazio'),
});
const userIdParamSchema = tenantIdParamSchema.extend({
  userId: z.string().trim().min(1, 'userId nao pode ser vazio'),
});

// O Zod aceita QUALQUER cargo do catalogo (inclusive 'owner'): a regra "quem
// pode criar/mover para qual cargo" mora NUM LUGAR SO (UserManagementService/
// outranks). Duplica-la aqui criaria duas fontes de verdade.
const roleSchema = z.enum(['owner', 'administrator', 'manager', 'operator', 'read_only']);
const statusSchema = z.enum(['active', 'suspended']);

const createUserBodySchema = z.object({
  email: z.string().trim().min(1).email('email invalido'),
  role: roleSchema,
  temporaryPassword: z.string().min(1),
});
const changeRoleBodySchema = z.object({ role: roleSchema });
const resetPasswordBodySchema = z.object({ temporaryPassword: z.string().min(1) });
// `limit` opcional no schema e default aplicado NO HANDLER (nao `.default()` do
// Zod): o `validateOrRespond` usa `z.ZodSchema<T>` (input = output), que nao
// representa schemas com default — mesmo motivo de os demais routers do
// projeto aplicarem defaults fora do schema.
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).optional(),
  status: statusSchema.optional(),
  role: roleSchema.optional(),
});
const DEFAULT_LIST_LIMIT = 20;

/**
 * Gestao de usuarios e SO PARA HUMANOS: a chave da empresa (plano maquina) e
 * liberada nas demais salas, mas aqui cada acao precisa de um ATOR
 * IDENTIFICAVEL (quem contratou? quem suspendeu?) — a chave nao tem "quem".
 * Alem de responsabilizacao, evita que uma integracao vazada crie contas.
 */
function requireHumanActor(req: Request, res: Response, next: NextFunction): void {
  const principal = (req as RequestWithPrincipal).principal;
  if (!principal || principal.kind !== 'user') {
    res.status(403).json({
      error: 'human_required',
      message: 'Gestao de usuarios exige login de pessoa (nao API key).',
    });
    return;
  }
  next();
}

/** Extrai o ator humano do principal — so chamado depois de `requireHumanActor`, entao o cast e seguro. */
function toActor(req: Request): UserManagementActor {
  const principal = (req as RequestWithPrincipal).principal as Extract<
    NonNullable<RequestWithPrincipal['principal']>,
    { kind: 'user' }
  >;
  return { userId: principal.userId, role: principal.role };
}

function toMeta(req: Request): AuthRequestMeta {
  return {
    userAgent:
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    ip: req.ip,
  };
}

/**
 * Router de gestao de usuarios (o "balcao do RH") — Milestone 5, Bloco M5E-3.
 * Thin router (D18): Zod + chamada ao UserManagementService + resposta HTTP;
 * TODA regra de negocio (hierarquia, auto-gestao, senha provisoria) vive no
 * service — os erros de Domain viram status no `usersErrorHandler` (path-
 * scoped, D17). Montado em `/api/tenants/:tenantId/users` ATRAS do
 * `authenticate` (ver index.ts).
 */
export function createUsersRouter(userManagementService: UserManagementService): Router {
  const router = Router({ mergeParams: true });

  router.use(requireHumanActor);

  router.get(
    '/',
    requirePermission('user:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const query = validateOrRespond(listQuerySchema, req.query, res);
      if (!query) return;

      const page = await userManagementService.listUsers(params.tenantId, {
        ...query,
        limit: query.limit ?? DEFAULT_LIST_LIMIT,
      });
      res.status(200).json(page);
    }),
  );

  router.post(
    '/',
    requirePermission('user:create'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(createUserBodySchema, req.body, res);
      if (!body) return;

      const user = await userManagementService.createUser(
        params.tenantId,
        toActor(req),
        body,
        toMeta(req),
      );
      res.status(201).json({ user });
    }),
  );

  router.patch(
    '/:userId/role',
    requirePermission('user:update'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(userIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(changeRoleBodySchema, req.body, res);
      if (!body) return;

      const user = await userManagementService.changeRole(
        params.tenantId,
        toActor(req),
        params.userId,
        body.role,
        toMeta(req),
      );
      res.status(200).json({ user });
    }),
  );

  router.post(
    '/:userId/suspend',
    requirePermission('user:suspend'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(userIdParamSchema, req.params, res);
      if (!params) return;

      const user = await userManagementService.suspendUser(
        params.tenantId,
        toActor(req),
        params.userId,
        toMeta(req),
      );
      res.status(200).json({ user });
    }),
  );

  router.post(
    '/:userId/reactivate',
    requirePermission('user:suspend'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(userIdParamSchema, req.params, res);
      if (!params) return;

      const user = await userManagementService.reactivateUser(
        params.tenantId,
        toActor(req),
        params.userId,
        toMeta(req),
      );
      res.status(200).json({ user });
    }),
  );

  router.post(
    '/:userId/reset-password',
    requirePermission('user:update'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(userIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(resetPasswordBodySchema, req.body, res);
      if (!body) return;

      const user = await userManagementService.resetPassword(
        params.tenantId,
        toActor(req),
        params.userId,
        body.temporaryPassword,
        toMeta(req),
      );
      res.status(200).json({ user });
    }),
  );

  return router;
}
