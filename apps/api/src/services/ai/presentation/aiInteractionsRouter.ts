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

/**
 * Fase 1, Bloco F1.4 (2026-08-01) — `GET .../ai-interactions/unanswered`.
 * Bloco B3 (issue #14): `sessionName` passou a ser OBRIGATÓRIO — ver a
 * docstring de `AiInteractionRepository.listUnansweredQuestions` (o Cérebro
 * da IA é 1:1 por sessão desde o M6H-3, então uma lacuna de conhecimento só
 * significa alguma coisa contra o Cérebro daquele WhatsApp).
 */
const listUnansweredQuestionsQuerySchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName é obrigatório'),
  limit: z.coerce.number().int().positive().optional(),
  /**
   * Restringe a UMA conversa — a timeline usa isto para saber quais bolhas
   * daquela conversa carregam uma lacuna. Ausente lista a sessão inteira.
   */
  conversationId: z.string().trim().min(1).optional(),
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

      const questions = await aiInteractionsService.listUnansweredQuestions(
        params.tenantId,
        query.sessionName,
        query.limit,
        query.conversationId,
      );
      res.status(200).json({ questions });
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
