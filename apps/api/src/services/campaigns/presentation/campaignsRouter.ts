import { Router, Request } from 'express';
import { z } from 'zod';

import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';
import { RequestWithPrincipal } from '../../../shared/presentation/authenticate';
import { CampaignService } from '../application/CampaignService';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});

const campaignIdParamSchema = z.object({
  campaignId: z.string().trim().min(1, 'campaignId não pode ser vazio'),
});

const listCampaignsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).optional(),
});

const listRecipientsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).optional(),
  status: z.enum(['pending', 'sent', 'failed', 'skipped', 'replied']).optional(),
});

const createCampaignBodySchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName não pode ser vazio'),
  name: z.string().trim().min(1, 'name não pode ser vazio').max(200),
  messageTemplate: z.string().trim().min(1, 'messageTemplate não pode ser vazio').max(4000),
  contactIds: z
    .array(z.string().trim().min(1))
    .min(1, 'Selecione pelo menos um contato.')
    .max(5000, 'No máximo 5.000 contatos por campanha.'),
});

/** `userId` de quem está autenticado, quando é uma PESSOA — mesmo helper de `contactsRouter`. */
function actorUserId(req: Request): string | undefined {
  const principal = (req as RequestWithPrincipal).principal;
  return principal && principal.kind === 'user' ? principal.userId : undefined;
}

/**
 * Router REST de campanhas — Fase L, Blocos L3 (criar/calcular) e L4 (motor
 * de envio: `start`/`pause`/`cancel`).
 *
 * Montado sob `/api/tenants/:tenantId/campaigns` (tenant-wide na URL, mesmo
 * padrão de `contactsRouter`; `sessionName` é um campo do corpo/da entidade,
 * não da rota — uma campanha é sempre de uma sessão, mas listar/consultar
 * campanhas não precisa estar aninhado por sessão).
 *
 * RBAC POR ROTA: `GET` exige `campaign:read` (operator+, mesmo nível de
 * `analytics:read`); toda escrita (`POST` de criar/`start`/`pause`/`cancel`)
 * exige `campaign:manage` (administrator+) — uma campanha errada atinge
 * muita gente de uma vez e pode custar o número.
 *
 * `start`/`pause`/`cancel` funcionam mesmo no modo degradado (sem
 * `REDIS_URL`) do ponto de vista da ROTA — a recusa acontece dentro de
 * `CampaignService.startCampaign()` (`SendingEngineNotConfiguredError`,
 * 503), não aqui.
 */
export function createCampaignsRouter(campaignService: CampaignService): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    requirePermission('campaign:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const query = validateOrRespond(listCampaignsQuerySchema, req.query, res);
      if (!query) return;

      const page = await campaignService.listCampaigns(params.tenantId, {
        limit: query.limit ?? 20,
        cursor: query.cursor,
      });
      res.status(200).json(page);
    }),
  );

  router.post(
    '/',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(createCampaignBodySchema, req.body, res);
      if (!body) return;

      const result = await campaignService.createCampaign({
        tenantId: params.tenantId,
        sessionName: body.sessionName,
        name: body.name,
        messageTemplate: body.messageTemplate,
        contactIds: body.contactIds,
        createdByUserId: actorUserId(req),
      });
      res.status(201).json(result);
    }),
  );

  router.get(
    '/:campaignId',
    requirePermission('campaign:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(campaignIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const result = await campaignService.getCampaign(params.tenantId, params.campaignId);
      res.status(200).json(result);
    }),
  );

  router.get(
    '/:campaignId/metrics',
    requirePermission('campaign:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(campaignIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const metrics = await campaignService.getCampaignMetrics(params.tenantId, params.campaignId);
      res.status(200).json({ metrics });
    }),
  );

  router.get(
    '/:campaignId/recipients',
    requirePermission('campaign:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(campaignIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const query = validateOrRespond(listRecipientsQuerySchema, req.query, res);
      if (!query) return;

      const page = await campaignService.listRecipients(params.tenantId, params.campaignId, {
        limit: query.limit ?? 50,
        cursor: query.cursor,
        status: query.status,
      });
      res.status(200).json(page);
    }),
  );

  // --- Fase L, Bloco L4 (motor de envio) — mesma permissão de criar (`campaign:manage`): iniciar/pausar/cancelar um disparo real é ação de alto risco. ---

  router.post(
    '/:campaignId/start',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(campaignIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const campaign = await campaignService.startCampaign(params.tenantId, params.campaignId);
      res.status(200).json({ campaign });
    }),
  );

  router.post(
    '/:campaignId/pause',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(campaignIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const campaign = await campaignService.pauseCampaign(params.tenantId, params.campaignId);
      res.status(200).json({ campaign });
    }),
  );

  router.post(
    '/:campaignId/cancel',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(campaignIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const campaign = await campaignService.cancelCampaign(params.tenantId, params.campaignId);
      res.status(200).json({ campaign });
    }),
  );

  return router;
}
