import { Router } from 'express';
import { z } from 'zod';
import {
  AiPreferencesService,
  MAX_TOPICS_TO_AVOID_LENGTH,
  MAX_CUSTOM_HANDOFF_MESSAGE_LENGTH,
} from '../application/AiPreferencesService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});

const sessionNameParamSchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName não pode ser vazio'),
});

/**
 * Corpo do `PUT` — todos os campos opcionais (upsert parcial, mesmo padrão
 * de `saveProfileBodySchema`): campos não informados preservam o valor já
 * gravado. `maxDiscountPercent`/`escalateAfterAttempts` aceitam `null`
 * explícito (limpa o limite configurado) — daí `.nullable().optional()`.
 */
const savePreferencesBodySchema = z.object({
  autonomyLevel: z.enum(['conservative', 'balanced', 'autonomous']).optional(),
  maxDiscountPercent: z.number().int().min(0).max(100).nullable().optional(),
  topicsToAvoid: z
    .string()
    .max(
      MAX_TOPICS_TO_AVOID_LENGTH,
      `O texto não pode passar de ${MAX_TOPICS_TO_AVOID_LENGTH} caracteres.`,
    )
    .nullable()
    .optional(),
  escalateAfterAttempts: z.number().int().min(1).max(20).nullable().optional(),
  customHandoffMessage: z
    .string()
    .max(
      MAX_CUSTOM_HANDOFF_MESSAGE_LENGTH,
      `A mensagem não pode passar de ${MAX_CUSTOM_HANDOFF_MESSAGE_LENGTH} caracteres.`,
    )
    .nullable()
    .optional(),
});

/**
 * Router REST (Presentation) das Preferências da IA — Cérebro da IA v3, Fase
 * 3 (2026-08-26). Vive em `services/ai/presentation/`, ao lado de
 * `aiProfileRouter` (mesmo bounded context, mesmo relacionamento 1:1 por
 * sessão). Montado sob
 * `/api/tenants/:tenantId/sessions/:sessionName/ai-preferences` (ver
 * `index.ts`).
 *
 * `GET /` devolve `{ preferences: AiPreferences | null }`. `PUT /` faz
 * upsert parcial e devolve o estado persistido.
 *
 * RBAC POR ROTA: reaproveita `ai_profile:read`/`ai_profile:update` — mesma
 * decisão já tomada para `aiFaqRouter` (a página do Cérebro da IA inteira já
 * é administrator/owner; não há motivo para uma permissão nova só para mais
 * uma aba do mesmo formulário).
 */
export function createAiPreferencesRouter(aiPreferencesService: AiPreferencesService): Router {
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

      const preferences = await aiPreferencesService.getPreferences(
        params.tenantId,
        params.sessionName,
      );
      res.status(200).json({ preferences });
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
      const body = validateOrRespond(savePreferencesBodySchema, req.body, res);
      if (!body) return;

      const preferences = await aiPreferencesService.savePreferences(
        params.tenantId,
        params.sessionName,
        {
          autonomyLevel: body.autonomyLevel,
          maxDiscountPercent: body.maxDiscountPercent,
          topicsToAvoid: body.topicsToAvoid,
          escalateAfterAttempts: body.escalateAfterAttempts,
          customHandoffMessage: body.customHandoffMessage,
        },
      );
      res.status(200).json({ preferences });
    }),
  );

  return router;
}
