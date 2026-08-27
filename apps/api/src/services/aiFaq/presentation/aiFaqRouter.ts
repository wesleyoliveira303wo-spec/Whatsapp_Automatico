import { Router } from 'express';
import { z } from 'zod';
import {
  AiFaqService,
  MAX_FAQ_QUESTION_LENGTH,
  MAX_FAQ_ANSWER_LENGTH,
  MAX_FAQ_CATEGORY_LENGTH,
} from '../application/AiFaqService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});
const sessionNameParamSchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName não pode ser vazio'),
});
const idParamSchema = z.object({ id: z.string().trim().min(1, 'id não pode ser vazio') });

const categorySchema = z
  .string()
  .trim()
  .max(MAX_FAQ_CATEGORY_LENGTH, `A categoria não pode passar de ${MAX_FAQ_CATEGORY_LENGTH} caracteres.`)
  .nullable()
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value));

const createBodySchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'A pergunta não pode ser vazia.')
    .max(MAX_FAQ_QUESTION_LENGTH, `A pergunta não pode passar de ${MAX_FAQ_QUESTION_LENGTH} caracteres.`),
  answer: z
    .string()
    .trim()
    .min(1, 'A resposta não pode ser vazia.')
    .max(MAX_FAQ_ANSWER_LENGTH, `A resposta não pode passar de ${MAX_FAQ_ANSWER_LENGTH} caracteres.`),
  category: categorySchema,
});

const updateBodySchema = z.object({
  question: createBodySchema.shape.question.optional(),
  answer: createBodySchema.shape.answer.optional(),
  category: categorySchema,
  active: z.boolean().optional(),
});

/**
 * Router REST da FAQ estruturada do Cérebro da IA (v3, Fase 2). Vive em
 * `services/aiFaq/presentation/`, bounded context próprio (CRUD autocontido,
 * sem Redis — mesmo racional de `services/quickReplies`). Montado sob
 * `/api/tenants/:tenantId/sessions/:sessionName/ai-faq` com
 * `{ mergeParams: true }`.
 *
 * RBAC POR ROTA: reaproveita as MESMAS permissões do resto do Cérebro da IA
 * (`ai_profile:read`/`ai_profile:update`) em vez de criar um par novo — a
 * página inteira `/ai` já é administrator/owner (gate no `getServerSideProps`
 * de `ai.tsx`), então uma permissão dedicada só duplicaria o mesmo nível de
 * acesso sem ganho real.
 */
export function createAiFaqRouter(aiFaqService: AiFaqService): Router {
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

      const faqEntries = await aiFaqService.listFaqEntries(params.tenantId, params.sessionName);
      res.status(200).json({ faqEntries });
    }),
  );

  router.post(
    '/',
    requirePermission('ai_profile:update'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(createBodySchema, req.body, res);
      if (!body) return;

      const faqEntry = await aiFaqService.createFaqEntry(
        params.tenantId,
        params.sessionName,
        body.question,
        body.answer,
        body.category,
      );
      res.status(201).json({ faqEntry });
    }),
  );

  router.put(
    '/:id',
    requirePermission('ai_profile:update'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema).merge(idParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(updateBodySchema, req.body, res);
      if (!body) return;

      const faqEntry = await aiFaqService.updateFaqEntry(
        params.tenantId,
        params.sessionName,
        params.id,
        body,
      );
      res.status(200).json({ faqEntry });
    }),
  );

  router.delete(
    '/:id',
    requirePermission('ai_profile:update'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema).merge(idParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      await aiFaqService.removeFaqEntry(params.tenantId, params.sessionName, params.id);
      res.status(204).send();
    }),
  );

  return router;
}
