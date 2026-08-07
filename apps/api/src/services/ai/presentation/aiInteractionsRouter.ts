import { Router } from 'express';
import { z } from 'zod';
import { AiInteractionsService } from '../application/AiInteractionsService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});

/**
 * `conversationId`/`limit` opcionais na query (Milestone 3, Bloco 5 — D13:
 * `conversationId` ausente lista o tenant inteiro, presente filtra por uma
 * conversa específica — ver `AiInteractionsService.listInteractions`).
 */
const listInteractionsQuerySchema = z.object({
  conversationId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().optional(),
});

/** Fase 1, Bloco F1.4 (2026-08-01) — `GET .../ai-interactions/unanswered`, só `limit`. */
const listUnansweredQuestionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
});

/**
 * Router REST (Presentation, Milestone 3, Bloco 5) para `GET
 * .../ai-interactions` — vive em `services/ai/presentation/`, separado de
 * `conversationsRouter` (D16 do levantamento arquitetural): `AiInteraction`
 * pertence ao bounded context `ai`, não `conversations`; um único router
 * misturando os dois cruzaria a fronteira de Presentation entre bounded
 * contexts, o que este projeto evita em todo outro lugar (D18: mesmo
 * padrão de thin router usado por `whatsAppSessionsRouter`/
 * `conversationsRouter`).
 *
 * Montado sob seu próprio path (`/api/tenants/:tenantId/ai-interactions`,
 * ver `index.ts`) — `{ mergeParams: true }` pelo mesmo motivo dos outros
 * dois routers.
 */
export function createAiInteractionsRouter(aiInteractionsService: AiInteractionsService): Router {
  const router = Router({ mergeParams: true });

  // Fase 1, Bloco F1.4 (2026-08-01): montada ANTES de `/` — `/unanswered`
  // não pode ser capturada por um `conversationId` na query da rota raiz
  // (não há conflito de path aqui, mas a ordem segue o mesmo cuidado já
  // registrado em outros routers deste projeto quando uma rota mais
  // específica precisa vir antes de uma mais genérica).
  router.get(
    '/unanswered',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const query = validateOrRespond(listUnansweredQuestionsQuerySchema, req.query, res);
      if (!query) return;

      const interactions = await aiInteractionsService.listUnansweredQuestions(
        params.tenantId,
        query.limit,
      );
      res.status(200).json({ interactions });
    }),
  );

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const query = validateOrRespond(listInteractionsQuerySchema, req.query, res);
      if (!query) return;

      const interactions = await aiInteractionsService.listInteractions(params.tenantId, query);
      res.status(200).json({ interactions });
    }),
  );

  return router;
}
