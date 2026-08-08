import { Router } from 'express';
import { z } from 'zod';
import {
  AiBusinessProfileService,
  MAX_PROFILE_CONTENT_LENGTH,
} from '../application/AiBusinessProfileService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});

/**
 * `sessionName` como param de rota — migração 1:1-tenant → 1:1-sessão
 * (M6H-3, 2026-07-25). Mesmo padrão de `whatsAppSessionsRouter`
 * (`tenantIdParamSchema.merge(sessionNameParamSchema)`).
 */
const sessionNameParamSchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName não pode ser vazio'),
});

/**
 * Formato "HH:MM" — aceito em `workingHoursStart`/`workingHoursEnd`.
 * Regex simples: 00–23 para hora, 00–59 para minuto. Não usa `.refine` por
 * fora de z.string() para manter a mensagem de erro clara.
 */
const timeSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    'Horário deve estar no formato HH:MM (ex.: "09:00", "18:30")',
  );

/**
 * Corpo do `PUT`. `content` obrigatório (pode ser vazio — "apaga o cérebro").
 * F1.8: campos de horário de atendimento opcionais. `workingDays` aceita
 * 0–127 (7 bits). `timezone` aceita qualquer string não vazia — a validação
 * de IANA real ficaria cara (lista de ~500 entradas) e é responsabilidade do
 * frontend oferecer só opções válidas; um valor inválido simplesmente faz o
 * `Intl.DateTimeFormat` lançar no `workingHours.ts`, mas ali a função
 * degrada graciosamente (devolve `true` = "dentro do horário") — nunca
 * silencia a IA.
 */
const saveProfileBodySchema = z.object({
  content: z
    .string()
    .max(
      MAX_PROFILE_CONTENT_LENGTH,
      `O texto não pode passar de ${MAX_PROFILE_CONTENT_LENGTH} caracteres.`,
    ),
  offHoursEnabled: z.boolean().optional(),
  offHoursMessage: z.string().nullable().optional(),
  workingHoursStart: timeSchema.nullable().optional(),
  workingHoursEnd: timeSchema.nullable().optional(),
  workingDays: z.number().int().min(0).max(127).optional(),
  timezone: z.string().min(1).optional(),
});

/** Corpo do `PATCH` (Fase 1, Botão POWER) — só o novo estado do toggle. */
const setAiEnabledBodySchema = z.object({
  aiEnabled: z.boolean(),
});

/**
 * Router REST (Presentation) da Base de Conhecimento (Nível 1) — o "Cérebro da
 * IA". Vive em `services/ai/presentation/`, ao lado de `aiInteractionsRouter`
 * (mesmo bounded context). Montado sob
 * `/api/tenants/:tenantId/sessions/:sessionName/ai-profile` (ver `index.ts`)
 * com `{ mergeParams: true }` pelo mesmo motivo dos demais routers.
 *
 * `GET /` devolve `{ profile: { content, updatedAt, offHoursEnabled, … } | null }`.
 * `PUT /` faz upsert com todos os campos e devolve o perfil persistido.
 *
 * F1.8 (2026-08-01): os 6 campos de horário de atendimento são incluídos no
 * corpo do `PUT` (opcionais) e na resposta do `GET`/`PUT`.
 *
 * RBAC POR ROTA: GET exige `ai_profile:read`, PUT/PATCH exigem
 * `ai_profile:update`.
 *
 * `PATCH /` (Fase 1, Botão POWER, 2026-08-07): liga/desliga SÓ `aiEnabled`
 * — endpoint dedicado, separado do `PUT` (upsert do perfil inteiro), porque
 * o botão precisa de um clique só, sem exigir que o formulário completo do
 * Cérebro da IA já esteja carregado no cliente. Mesma permissão do `PUT`
 * (reusa `ai_profile:update` — é literalmente o mesmo recurso).
 */
export function createAiProfileRouter(aiBusinessProfileService: AiBusinessProfileService): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    requirePermission('ai_profile:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const profile = await aiBusinessProfileService.getProfile(
        params.tenantId,
        params.sessionName,
      );
      res.status(200).json({ profile });
    }),
  );

  router.put(
    '/',
    requirePermission('ai_profile:update'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(saveProfileBodySchema, req.body, res);
      if (!body) return;

      const profile = await aiBusinessProfileService.saveProfile(
        params.tenantId,
        params.sessionName,
        {
          content: body.content,
          offHoursEnabled: body.offHoursEnabled,
          offHoursMessage: body.offHoursMessage,
          workingHoursStart: body.workingHoursStart,
          workingHoursEnd: body.workingHoursEnd,
          workingDays: body.workingDays,
          timezone: body.timezone,
        },
      );
      res.status(200).json({ profile });
    }),
  );

  router.patch(
    '/',
    requirePermission('ai_profile:update'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(setAiEnabledBodySchema, req.body, res);
      if (!body) return;

      const profile = await aiBusinessProfileService.setAiEnabled(
        params.tenantId,
        params.sessionName,
        body.aiEnabled,
      );
      res.status(200).json({ profile });
    }),
  );

  return router;
}
