import { Router } from 'express';
import { z } from 'zod';
import { TagService } from '../application/TagService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});
const conversationIdParamSchema = z.object({
  conversationId: z.string().trim().min(1, 'conversationId não pode ser vazio'),
});
const tagIdParamSchema = z.object({ tagId: z.string().trim().min(1, 'tagId não pode ser vazio') });

/**
 * Router de ATRIBUIÇÃO de tags a uma conversa (Redesign 2026-08-05, R4) —
 * distinto do catálogo (`tagRouter`, por sessão): aqui a chave é a
 * conversa, mesmo padrão FLAT (não aninhado por sessão) já usado por
 * `conversationsRouter` — `conversationId` já é único no tenant. Montado
 * sob `/api/tenants/:tenantId/conversations/:conversationId/tags`.
 *
 * Sem `GET` aqui de propósito: as tags atribuídas já vêm embutidas em
 * `Conversation.tags` (toda resposta de `conversationsRouter`, list e
 * detalhe) — populadas por `PrismaConversationRepository` via `include`
 * direto no Postgres, sem chamada HTTP extra. Uma segunda rota só para
 * listar seria dado duplicado.
 *
 * RBAC: `POST`/`DELETE` exigem `message:send` (operator+) — mesma régua já
 * adotada para mover card no Pipeline (ADR #84): atribuir/remover tag é
 * ação operacional do dia a dia, não administração da empresa (essa é a
 * régua do CATÁLOGO — criar/editar/remover a tag em si — `tag:manage`).
 */
export function createConversationTagRouter(tagService: TagService): Router {
  const router = Router({ mergeParams: true });

  router.post(
    '/:tagId',
    requirePermission('message:send'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema).merge(tagIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      await tagService.assignTag(params.tenantId, params.conversationId, params.tagId);
      res.status(204).send();
    }),
  );

  router.delete(
    '/:tagId',
    requirePermission('message:send'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema).merge(tagIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      await tagService.unassignTag(params.tenantId, params.conversationId, params.tagId);
      res.status(204).send();
    }),
  );

  return router;
}
