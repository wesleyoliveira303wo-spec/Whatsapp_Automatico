import { Router } from 'express';
import { z } from 'zod';
import { AnalyticsService } from '../application/AnalyticsService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId nao pode ser vazio'),
});

/**
 * `sessionName` como param de rota — migracao tenant-wide -> por-sessao
 * (M6H-4, 2026-07-26). Mesmo padrao de `whatsAppSessionsRouter`/
 * `aiProfileRouter` (`tenantIdParamSchema.merge(sessionNameParamSchema)`).
 */
const sessionNameParamSchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName nao pode ser vazio'),
});

/**
 * Query de faixa de tempo (Milestone 4, Bloco M4C — D45/D48). `from`/`to`
 * obrigatorios, validados como datas ISO parseaveis (parsing e uma
 * preocupacao de Presentation; a validacao LOGICA da faixa — from<=to, teto
 * de janela — vive no `AnalyticsService`, D48, e vira 400 via o error
 * handler). `granularity` so admite `day` no MVP (D48) — qualquer outro valor
 * falha a validacao Zod (400), nunca chega ao Service.
 */
const dateRangeQuerySchema = z.object({
  from: z
    .string()
    .min(1)
    .refine((v) => !Number.isNaN(Date.parse(v)), 'from deve ser uma data ISO valida'),
  to: z
    .string()
    .min(1)
    .refine((v) => !Number.isNaN(Date.parse(v)), 'to deve ser uma data ISO valida'),
  granularity: z.enum(['day']).optional().default('day'),
});

/**
 * Router REST de Analytics (Presentation, Milestone 4, Bloco M4C). Thin
 * router (mesmo padrao D18 de `conversationsRouter`/`aiInteractionsRouter`):
 * so validacao Zod + leitura de query + chamada ao `AnalyticsService` +
 * resposta HTTP. NENHUM SQL, NENHUM Prisma, NENHUMA regra de negocio aqui —
 * SQL vive exclusivamente em `PrismaAnalyticsRepository` (restricao do M4C).
 *
 * `{ mergeParams: true }` porque e montado em
 * `/api/tenants/:tenantId/sessions/:sessionName/analytics` (ver `index.ts`)
 * — migrado da rota flat `/api/tenants/:tenantId/analytics` no M6H-4
 * (2026-07-26), mesmo padrao ja usado por `aiProfileRouter` (M6H-3) e
 * `whatsAppSessionsRouter` para recursos por sessao. BREAKING CHANGE
 * deliberado do contrato REST (sem clientes externos alem do Dashboard).
 */
export function createAnalyticsRouter(analyticsService: AnalyticsService): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/ai-usage',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const query = validateOrRespond(dateRangeQuerySchema, req.query, res);
      if (!query) return;

      const points = await analyticsService.getAiUsage(params.tenantId, params.sessionName, {
        from: new Date(query.from),
        to: new Date(query.to),
      });
      res.status(200).json({ points });
    }),
  );

  router.get(
    '/messages',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const query = validateOrRespond(dateRangeQuerySchema, req.query, res);
      if (!query) return;

      const points = await analyticsService.getMessageFlow(params.tenantId, params.sessionName, {
        from: new Date(query.from),
        to: new Date(query.to),
      });
      res.status(200).json({ points });
    }),
  );

  router.get(
    '/conversations',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const query = validateOrRespond(dateRangeQuerySchema, req.query, res);
      if (!query) return;

      const range = { from: new Date(query.from), to: new Date(query.to) };
      // D42: "Conversas" cobre serie temporal de novas conversas + retrato
      // atual por status. Os dois vivem sob este unico endpoint (D48 lista
      // `.../analytics/conversations`), cada um vindo de um metodo distinto do
      // Service. `statusCounts` ignora a faixa por ser um retrato do estado
      // corrente, nao serie temporal.
      const newConversations = await analyticsService.getNewConversations(
        params.tenantId,
        params.sessionName,
        range,
      );
      const statusCounts = await analyticsService.getConversationStatusCounts(
        params.tenantId,
        params.sessionName,
      );
      res.status(200).json({ newConversations, statusCounts });
    }),
  );

  router.get(
    '/session-stability',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const query = validateOrRespond(dateRangeQuerySchema, req.query, res);
      if (!query) return;

      const points = await analyticsService.getSessionStability(
        params.tenantId,
        params.sessionName,
        {
          from: new Date(query.from),
          to: new Date(query.to),
        },
      );
      res.status(200).json({ points });
    }),
  );

  // Fase 1, Bloco F1.6 — Analytics de NEGOCIO (funil do Pipeline + taxa de
  // escalonamento). Sem `requirePermission` explicito aqui: a permissao
  // `analytics:read` e aplicada ao ROUTER INTEIRO em `index.ts`, mesmo padrao
  // dos 4 endpoints acima.
  router.get(
    '/pipeline',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const funnel = await analyticsService.getPipelineFunnel(params.tenantId, params.sessionName);
      res.status(200).json({ funnel });
    }),
  );

  router.get(
    '/escalation-rate',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const query = validateOrRespond(dateRangeQuerySchema, req.query, res);
      if (!query) return;

      const points = await analyticsService.getEscalationRate(params.tenantId, params.sessionName, {
        from: new Date(query.from),
        to: new Date(query.to),
      });
      res.status(200).json({ points });
    }),
  );

  return router;
}
