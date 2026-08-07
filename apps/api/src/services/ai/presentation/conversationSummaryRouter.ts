import { Router } from 'express';
import { z } from 'zod';
import { ConversationSummaryService } from '../application/ConversationSummaryService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});
const conversationIdParamSchema = z.object({
  conversationId: z.string().trim().min(1, 'conversationId não pode ser vazio'),
});

/**
 * Router de geração do resumo de UMA conversa pela IA (Redesign 2026-08-05,
 * R5) — mesmo padrão FLAT (não aninhado por sessão) já usado por
 * `conversationTagRouter`: `conversationId` já é único no tenant. Montado
 * sob `/api/tenants/:tenantId/conversations/:conversationId/summary`.
 *
 * RBAC: `message:send` (operator+) — mesma régua já adotada para mover card
 * no Pipeline (ADR #84) e para atribuir/remover tag (R4): gerar um resumo é
 * ação operacional do dia a dia, não administração da empresa; custa
 * dinheiro (chamada de IA), então fica ACIMA de `read_only`, mas não exige
 * `administrator`/`owner`.
 *
 * Só `POST` — geração é sempre sob demanda (botão), nunca automática; não há
 * `GET` dedicado porque o resumo já vem embutido em `Conversation.aiSummary`
 * (toda resposta de `conversationsRouter`, mesmo racional de
 * `Conversation.tags`, R4).
 */
export function createConversationSummaryRouter(
  conversationSummaryService: ConversationSummaryService,
): Router {
  const router = Router({ mergeParams: true });

  router.post(
    '/:conversationId/summary',
    requirePermission('message:send'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const conversation = await conversationSummaryService.generateSummary(
        params.tenantId,
        params.conversationId,
      );
      res.status(200).json(conversation);
    }),
  );

  return router;
}
