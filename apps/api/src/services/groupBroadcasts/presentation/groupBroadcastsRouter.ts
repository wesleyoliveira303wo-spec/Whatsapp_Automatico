import {
  MAX_RECURRENCE_INTERVAL_HOURS,
  MAX_RECURRENCE_RUNS,
  MIN_RECURRENCE_INTERVAL_HOURS,
} from '../domain/policies/groupBroadcastRecurrence';
import { Router, Request, raw } from 'express';
import { z } from 'zod';

import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';
import { RequestWithPrincipal } from '../../../shared/presentation/authenticate';
import {
  GroupBroadcastActor,
  GroupBroadcastService,
} from '../application/GroupBroadcastService';
import {
  MAX_GROUP_INTERVAL_SECONDS,
  MAX_GROUP_MEDIA_UPLOAD_BYTES,
  MAX_GROUPS_PER_BROADCAST,
  MIN_GROUP_INTERVAL_SECONDS,
} from '../domain/policies/groupBroadcastPacing';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});

const broadcastIdParamSchema = z.object({
  broadcastId: z.string().trim().min(1, 'broadcastId não pode ser vazio'),
});

const listQuerySchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName não pode ser vazio'),
});

/**
 * Só JIDs de GRUPO (`...@g.us`) — um id de pessoa aqui seria um disparo 1:1
 * disfarçado, fora das três regras de supressão de campanha (opt-out etc.).
 * O teto de alvos é checado de novo no serviço (defesa em profundidade: o
 * serviço não confia só na borda HTTP).
 */
const createBodySchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName não pode ser vazio'),
  name: z.string().trim().min(1, 'name não pode ser vazio').max(200),
  messageTemplate: z.string().trim().min(1, 'messageTemplate não pode ser vazio').max(4000),
  groupJids: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[^@\s]+@g\.us$/, 'Cada destino precisa ser um grupo (…@g.us).'),
    )
    .min(1, 'Selecione pelo menos um grupo.')
    .max(MAX_GROUPS_PER_BROADCAST, `No máximo ${MAX_GROUPS_PER_BROADCAST} grupos por disparo.`),
  intervalSeconds: z
    .number()
    .int()
    .min(MIN_GROUP_INTERVAL_SECONDS)
    .max(MAX_GROUP_INTERVAL_SECONDS)
    .optional(),
  // Recorrência (2026-09-11). Ausente = publicação única, como sempre foi.
  recurrenceIntervalHours: z
    .number()
    .int()
    .min(MIN_RECURRENCE_INTERVAL_HOURS)
    .max(MAX_RECURRENCE_INTERVAL_HOURS)
    .optional(),
  /** Fim por contagem: mínimo 2 (1 repetição seria a publicação única). */
  recurrenceMaxRuns: z.number().int().min(2).max(MAX_RECURRENCE_RUNS).optional(),
  /** Fim por data: ISO-8601; o Service recusa data no passado. */
  recurrenceEndsAt: z.coerce.date().optional(),
  sendWindowStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário precisa ser "HH:MM".')
    .optional(),
  sendWindowEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário precisa ser "HH:MM".')
    .optional(),
});

/** Mesmo contrato do upload de mídia de campanha (L8): corpo é o arquivo cru, categoria/nome em headers. */
const mediaHeadersSchema = z.object({
  'x-media-content-type': z.enum(['image', 'video']),
  'content-type': z
    .string()
    .trim()
    .min(1, 'Content-Type é obrigatório para identificar o mimeType do arquivo.'),
  'x-media-filename': z.string().trim().max(255).optional(),
});

function toActor(req: Request): GroupBroadcastActor {
  const principal = (req as RequestWithPrincipal).principal;
  const userAgent = req.headers['user-agent'];
  return {
    userId: principal && principal.kind === 'user' ? principal.userId : undefined,
    ip: req.ip,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
  };
}

/**
 * Router REST de disparos em grupos — 2026-09-11. Montado sob
 * `/api/tenants/:tenantId/group-broadcasts` (tenant-wide na URL, mesmo padrão
 * de `campaignsRouter`; `sessionName` vem no corpo/na query). Toda consulta do
 * serviço é escopada pelo `tenantId` do PATH — um id de disparo de outro
 * tenant simplesmente não é encontrado (404), nunca vaza.
 *
 * RBAC POR ROTA, mesma régua de campanhas: leitura `campaign:read`
 * (operator+); criar/iniciar/pausar/cancelar/excluir/mídia `campaign:manage`
 * (administrator+) — é a ação de maior raio de estrago do produto.
 */
export function createGroupBroadcastsRouter(service: GroupBroadcastService): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    requirePermission('campaign:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const query = validateOrRespond(listQuerySchema, req.query, res);
      if (!query) return;

      const broadcasts = await service.listBroadcasts(params.tenantId, query.sessionName);
      res.status(200).json({ broadcasts });
    }),
  );

  router.post(
    '/',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(createBodySchema, req.body, res);
      if (!body) return;

      const actor = toActor(req);
      const result = await service.createBroadcast(
        {
          tenantId: params.tenantId,
          sessionName: body.sessionName,
          name: body.name,
          messageTemplate: body.messageTemplate,
          groupJids: body.groupJids,
          intervalSeconds: body.intervalSeconds,
          recurrenceIntervalHours: body.recurrenceIntervalHours,
          recurrenceMaxRuns: body.recurrenceMaxRuns,
          recurrenceEndsAt: body.recurrenceEndsAt,
          sendWindowStart: body.sendWindowStart,
          sendWindowEnd: body.sendWindowEnd,
          createdByUserId: actor.userId,
        },
        actor,
      );
      res.status(201).json(result);
    }),
  );

  router.get(
    '/:broadcastId',
    requirePermission('campaign:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(broadcastIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const detail = await service.getBroadcast(params.tenantId, params.broadcastId);
      res.status(200).json(detail);
    }),
  );

  router.delete(
    '/:broadcastId',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(broadcastIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      await service.deleteBroadcast(params.tenantId, params.broadcastId);
      res.status(204).send();
    }),
  );

  router.post(
    '/:broadcastId/start',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(broadcastIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const broadcast = await service.startBroadcast(
        params.tenantId,
        params.broadcastId,
        toActor(req),
      );
      res.status(200).json({ broadcast });
    }),
  );

  router.post(
    '/:broadcastId/pause',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(broadcastIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const broadcast = await service.pauseBroadcast(params.tenantId, params.broadcastId);
      res.status(200).json({ broadcast });
    }),
  );

  router.post(
    '/:broadcastId/cancel',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(broadcastIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const broadcast = await service.cancelBroadcast(
        params.tenantId,
        params.broadcastId,
        toActor(req),
      );
      res.status(200).json({ broadcast });
    }),
  );

  /**
   * `raw()` só nesta rota (substitui `express.json()`), mesmo padrão de
   * `POST .../campaigns/:id/media`: o corpo é o ARQUIVO. O limite do corpo é
   * o maior teto (vídeo); o teto por tipo é conferido no serviço.
   */
  router.post(
    '/:broadcastId/media',
    requirePermission('campaign:manage'),
    raw({ type: () => true, limit: MAX_GROUP_MEDIA_UPLOAD_BYTES }),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(broadcastIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const headers = validateOrRespond(mediaHeadersSchema, req.headers, res);
      if (!headers) return;
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({
          error: 'empty_body',
          message: 'O corpo da requisição precisa ser o arquivo (não vazio).',
        });
        return;
      }

      const broadcast = await service.attachMedia(params.tenantId, params.broadcastId, {
        contentType: headers['x-media-content-type'],
        buffer: req.body,
        mimeType: headers['content-type'],
        fileName: headers['x-media-filename'],
      });
      res.status(200).json({ broadcast });
    }),
  );

  router.delete(
    '/:broadcastId/media',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(broadcastIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const broadcast = await service.removeMedia(params.tenantId, params.broadcastId);
      res.status(200).json({ broadcast });
    }),
  );

  /** Streaming do anexo para preview — leitura (`campaign:read`), mesmo padrão de `GET .../campaigns/:id/media`. */
  router.get(
    '/:broadcastId/media',
    requirePermission('campaign:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(broadcastIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const media = await service.getMedia(params.tenantId, params.broadcastId);
      res.setHeader('Content-Type', media.mimeType);
      if (media.fileName) {
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(media.fileName)}"`,
        );
      }
      res.status(200).send(media.buffer);
    }),
  );

  return router;
}
