import { Router, Request, text, raw } from 'express';
import { z } from 'zod';

import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';
import { RequestWithPrincipal } from '../../../shared/presentation/authenticate';
import { CampaignService, MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES } from '../application/CampaignService';

/** Teto do corpo do upload de planilha de destinatários — mesmo valor de `MAX_IMPORT_UPLOAD_BYTES` (`contactsRouter.ts`), texto puro. */
export const MAX_RECIPIENTS_CSV_BYTES = 5 * 1024 * 1024;

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});

const campaignIdParamSchema = z.object({
  campaignId: z.string().trim().min(1, 'campaignId não pode ser vazio'),
});

const listCampaignsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).optional(),
  /** Aditivo (2026-08-18) — a tela de Campanhas sempre filtra por UMA sessão. */
  sessionName: z.string().trim().min(1).optional(),
});

/** `GET /overview` — retrofit visual 2026-08-18. */
const sessionOverviewQuerySchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName não pode ser vazio'),
});

const listRecipientsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).optional(),
  status: z.enum(['pending', 'sent', 'failed', 'skipped', 'replied']).optional(),
});

const rawPhoneRecipientSchema = z.object({
  rawPhone: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200).optional(),
});

/**
 * Reorganização Contatos/Campanhas (2026-08-17): três origens combináveis —
 * `contactIds` (Contatos salvos), `phoneRecipients` (planilha já parseada +
 * números colados, combinados pela UI numa lista só). Pelo menos uma origem
 * precisa ter algo, e o total combinado respeita o mesmo teto de sempre.
 */
const createCampaignBodySchema = z
  .object({
    sessionName: z.string().trim().min(1, 'sessionName não pode ser vazio'),
    name: z.string().trim().min(1, 'name não pode ser vazio').max(200),
    description: z.string().trim().max(1000).optional(),
    messageTemplate: z.string().trim().min(1, 'messageTemplate não pode ser vazio').max(4000),
    contactIds: z.array(z.string().trim().min(1)).max(5000).default([]),
    phoneRecipients: z.array(rawPhoneRecipientSchema).max(5000).default([]),
  })
  .refine((data) => data.contactIds.length + data.phoneRecipients.length > 0, {
    message: 'Selecione pelo menos um destinatário (contato salvo, planilha ou número manual).',
  })
  .refine((data) => data.contactIds.length + data.phoneRecipients.length <= 5000, {
    message: 'No máximo 5.000 destinatários por campanha (somando todas as origens).',
  });

/**
 * Headers do `POST .../media` (Fase L, Bloco L8) — mesmo padrão de
 * `sendMediaHeadersSchema` (`conversationsRouter.ts`, F1.3): o corpo é o
 * ARQUIVO BRUTO (sem multipart), então categoria/nome de arquivo viajam em
 * headers dedicados. Sem `x-media-caption` — a legenda de uma campanha É o
 * `messageTemplate` já cadastrado, nunca um texto separado do anexo.
 */
const campaignMediaHeadersSchema = z.object({
  'x-media-content-type': z.enum(['image', 'audio', 'video', 'document']),
  'content-type': z
    .string()
    .trim()
    .min(1, 'Content-Type é obrigatório para identificar o mimeType do arquivo.'),
  'x-media-filename': z.string().trim().max(255).optional(),
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
        sessionName: query.sessionName,
      });
      res.status(200).json(page);
    }),
  );

  /**
   * `GET /overview` — retrofit visual 2026-08-18. Registrada ANTES de
   * `/:campaignId` (mesmo motivo de `/parse-recipients-csv`/`/stats` no
   * resto do projeto) para o Express não confundir "overview" com um
   * `campaignId`.
   */
  router.get(
    '/overview',
    requirePermission('campaign:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const query = validateOrRespond(sessionOverviewQuerySchema, req.query, res);
      if (!query) return;

      const overview = await campaignService.getSessionOverview(
        params.tenantId,
        query.sessionName,
      );
      res.status(200).json({ overview });
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
        description: body.description,
        messageTemplate: body.messageTemplate,
        contactIds: body.contactIds,
        phoneRecipients: body.phoneRecipients,
        createdByUserId: actorUserId(req),
      });
      res.status(201).json(result);
    }),
  );

  /**
   * `POST /parse-recipients-csv` — só PARSEIA (nunca persiste nada), Seção 2
   * da tela de criação. Corpo é o TEXTO CRU do `.csv` (mesmo padrão de
   * `POST /contacts/import`) — `text()` no lugar de `raw()` porque aqui o
   * resultado é sempre interpretado como string (nenhum binário).
   *
   * Registrada ANTES de `/:campaignId` (mesmo motivo de `/stats` em
   * `contactsRouter.ts`) para o Express não confundir "parse-recipients-csv"
   * com um `campaignId`.
   */
  router.post(
    '/parse-recipients-csv',
    requirePermission('campaign:manage'),
    text({ type: () => true, limit: MAX_RECIPIENTS_CSV_BYTES }),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      if (typeof req.body !== 'string' || req.body.trim().length === 0) {
        res.status(400).json({
          error: 'empty_body',
          message: 'O corpo da requisição precisa ser o arquivo CSV (não vazio).',
        });
        return;
      }

      const report = campaignService.parseRecipientsCsv(req.body);
      res.status(200).json(report);
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

  /**
   * `DELETE /:campaignId` — retrofit visual 2026-08-18 (menu "⋮" da lista).
   * Mesma permissão de criar/start/pause/cancel (`campaign:manage`): apagar
   * uma campanha é uma ação de gestão de alto risco, não atendimento do dia
   * a dia. Recusa campanha `running` (`CampaignService.deleteCampaign`).
   */
  router.delete(
    '/:campaignId',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(campaignIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      await campaignService.deleteCampaign(params.tenantId, params.campaignId);
      res.status(204).send();
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

  /**
   * `POST /:campaignId/reopen` — retrofit 2026-08-18 (pedido do fundador).
   * Só a partir de `completed`/`cancelled`; devolve destinatários `FAILED`
   * para `PENDING` (nunca `SKIPPED`) e reagenda. Mesma permissão de
   * start/pause/cancel: reenviar mensagens reais é ação de alto risco.
   */
  router.post(
    '/:campaignId/reopen',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(campaignIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const campaign = await campaignService.reopenCampaign(params.tenantId, params.campaignId);
      res.status(200).json({ campaign });
    }),
  );

  // --- Fase L, Bloco L8 (mídia na campanha) ---
  // Mesma permissão de criar/start/pause/cancel (`campaign:manage`): mudar o
  // conteúdo de um disparo em massa é ação de gestão de alto risco.

  /**
   * `POST /:campaignId/media` — anexa (ou substitui) a mídia da campanha.
   * `raw({ type: () => true, limit })` substitui `express.json()` só nesta
   * rota, mesmo motivo/mesmo padrão de `POST .../conversations/:id/media`
   * (F1.3): o corpo é o ARQUIVO em si, nunca JSON. Síncrono — `200` com a
   * `Campaign` atualizada, ou o erro mapeado (413/400/404/409) pelo
   * `campaignsErrorHandler`.
   */
  router.post(
    '/:campaignId/media',
    requirePermission('campaign:manage'),
    raw({ type: () => true, limit: MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES }),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(campaignIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const headers = validateOrRespond(campaignMediaHeadersSchema, req.headers, res);
      if (!headers) return;
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({
          error: 'empty_body',
          message: 'O corpo da requisição precisa ser o arquivo (não vazio).',
        });
        return;
      }

      const campaign = await campaignService.attachCampaignMedia(params.tenantId, params.campaignId, {
        contentType: headers['x-media-content-type'],
        buffer: req.body,
        mimeType: headers['content-type'],
        fileName: headers['x-media-filename'],
      });
      res.status(200).json({ campaign });
    }),
  );

  /** `DELETE /:campaignId/media` — remove a mídia anexada (volta a ser uma campanha só de texto). */
  router.delete(
    '/:campaignId/media',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(campaignIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const campaign = await campaignService.removeCampaignMedia(params.tenantId, params.campaignId);
      res.status(200).json({ campaign });
    }),
  );

  /**
   * `GET /:campaignId/media` — streaming binário do anexo, para preview na
   * Dashboard (`<img src=...>`) — mesmo padrão de
   * `GET .../messages/:messageId/media` (F1.1, ADR #90). `campaign:read`
   * (operator+, não `campaign:manage`): visualizar o que a campanha vai
   * enviar é leitura do dia a dia, não gestão.
   */
  router.get(
    '/:campaignId/media',
    requirePermission('campaign:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(campaignIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const media = await campaignService.getCampaignMedia(params.tenantId, params.campaignId);
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
