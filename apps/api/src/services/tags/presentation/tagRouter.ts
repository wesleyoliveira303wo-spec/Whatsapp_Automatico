import { Router } from 'express';
import { z } from 'zod';
import { TagService, MAX_TAG_NAME_LENGTH } from '../application/TagService';
import { TAG_COLORS } from '../domain/entities/Tag';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});
const sessionNameParamSchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName não pode ser vazio'),
});
const idParamSchema = z.object({ id: z.string().trim().min(1, 'id não pode ser vazio') });

const tagColorSchema = z.enum(TAG_COLORS);

const createTagBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'O nome não pode ser vazio.')
    .max(MAX_TAG_NAME_LENGTH, `O nome não pode passar de ${MAX_TAG_NAME_LENGTH} caracteres.`),
  color: tagColorSchema,
});

const updateTagBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'O nome não pode ser vazio.')
    .max(MAX_TAG_NAME_LENGTH, `O nome não pode passar de ${MAX_TAG_NAME_LENGTH} caracteres.`)
    .optional(),
  color: tagColorSchema.optional(),
});

/**
 * Router REST do CATÁLOGO de tags (Redesign 2026-08-05, R4). Vive em
 * `services/tags/presentation/`, ao lado de `conversationTagRouter`
 * (atribuição). Montado sob
 * `/api/tenants/:tenantId/sessions/:sessionName/tags` (ver `index.ts`) com
 * `{ mergeParams: true }`, mesmo padrão de `quickReplyRouter`.
 *
 * RBAC POR ROTA: `GET` exige `tag:read` (operator+); `POST`/`PUT`/`DELETE`
 * exigem `tag:manage` (administrator/owner).
 */
export function createTagRouter(tagService: TagService): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    requirePermission('tag:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const tags = await tagService.listTags(params.tenantId, params.sessionName);
      res.status(200).json({ tags });
    }),
  );

  router.post(
    '/',
    requirePermission('tag:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(createTagBodySchema, req.body, res);
      if (!body) return;

      const tag = await tagService.createTag(
        params.tenantId,
        params.sessionName,
        body.name,
        body.color,
      );
      res.status(201).json({ tag });
    }),
  );

  router.put(
    '/:id',
    requirePermission('tag:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema).merge(idParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(updateTagBodySchema, req.body, res);
      if (!body) return;

      const tag = await tagService.updateTag(params.tenantId, params.sessionName, params.id, body);
      res.status(200).json({ tag });
    }),
  );

  router.delete(
    '/:id',
    requirePermission('tag:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema).merge(idParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      await tagService.removeTag(params.tenantId, params.sessionName, params.id);
      res.status(204).send();
    }),
  );

  return router;
}
