import { Router } from 'express';
import { z } from 'zod';
import {
  QuickReplyService,
  MAX_QUICK_REPLY_CONTENT_LENGTH,
} from '../application/QuickReplyService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});
const sessionNameParamSchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName não pode ser vazio'),
});
const idParamSchema = z.object({ id: z.string().trim().min(1, 'id não pode ser vazio') });

const contentBodySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'O texto não pode ser vazio.')
    .max(
      MAX_QUICK_REPLY_CONTENT_LENGTH,
      `O texto não pode passar de ${MAX_QUICK_REPLY_CONTENT_LENGTH} caracteres.`,
    ),
});

/**
 * Router REST das respostas rápidas (Fase 1, Bloco F1.9). Vive em
 * `services/quickReplies/presentation/`, bounded context próprio (CRUD
 * autocontido, sem depender de IA/conversas/Redis — mesmo racional de
 * `services/analytics`). Montado sob
 * `/api/tenants/:tenantId/sessions/:sessionName/quick-replies` (ver
 * `index.ts`) com `{ mergeParams: true }`, mesmo padrão de `aiProfileRouter`.
 *
 * RBAC POR ROTA: `GET` exige `quick_reply:read` (operator+ — quem já manda
 * mensagem já pode listar/inserir); `POST`/`PUT`/`DELETE` exigem
 * `quick_reply:manage` (administrator/owner — mesmo nível de `ai_profile:update`).
 */
export function createQuickReplyRouter(quickReplyService: QuickReplyService): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    requirePermission('quick_reply:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const quickReplies = await quickReplyService.listQuickReplies(
        params.tenantId,
        params.sessionName,
      );
      res.status(200).json({ quickReplies });
    }),
  );

  router.post(
    '/',
    requirePermission('quick_reply:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(contentBodySchema, req.body, res);
      if (!body) return;

      const quickReply = await quickReplyService.createQuickReply(
        params.tenantId,
        params.sessionName,
        body.content,
      );
      res.status(201).json({ quickReply });
    }),
  );

  router.put(
    '/:id',
    requirePermission('quick_reply:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema).merge(idParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(contentBodySchema, req.body, res);
      if (!body) return;

      const quickReply = await quickReplyService.updateQuickReply(
        params.tenantId,
        params.sessionName,
        params.id,
        body.content,
      );
      res.status(200).json({ quickReply });
    }),
  );

  router.delete(
    '/:id',
    requirePermission('quick_reply:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema).merge(idParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      await quickReplyService.removeQuickReply(params.tenantId, params.sessionName, params.id);
      res.status(204).send();
    }),
  );

  return router;
}
