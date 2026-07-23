import { Router, Request } from 'express';
import { z } from 'zod';
import { ConversationsService, ConversationActor } from '../application/ConversationsService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';
import { RequestWithPrincipal } from '../../../shared/presentation/authenticate';
import { hasPermission } from '../../auth/domain/permissions';

/**
 * Traduz o `principal` (resolvido pelo `authenticate`) no `ConversationActor`
 * que o Service entende (Milestone 5, Bloco M5D). Plano MÁQUINA (chave da
 * empresa) ou ausência de principal = ator sem `userId` e com `canResumeAny`
 * (acesso total, lado confiável). Plano PESSOA = `userId` + o flag de
 * "retomar qualquer" derivado do cargo.
 */
function toActor(req: Request): ConversationActor {
  const principal = (req as RequestWithPrincipal).principal;
  if (!principal || principal.kind === 'machine') {
    return { userId: undefined, canResumeAny: true };
  }
  return { userId: principal.userId, canResumeAny: hasPermission(principal.role, 'conversation:resume_any') };
}

function toMeta(req: Request): { userAgent?: string; ip?: string } {
  const userAgent = req.headers['user-agent'];
  return { userAgent: typeof userAgent === 'string' ? userAgent : undefined, ip: req.ip };
}

const tenantIdParamSchema = z.object({ tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio') });
const conversationIdParamSchema = z.object({ conversationId: z.string().trim().min(1, 'conversationId não pode ser vazio') });

/**
 * `status`/`limit`/`cursor` opcionais na query string (Milestone 3, Bloco 5
 * — D11). `status`, se informado, precisa ser exatamente `'bot'` ou
 * `'human'` (união literal do Domain, `Conversation['status']`) — qualquer
 * outro valor falha a validação Zod (400), nunca chega ao Service. `.optional()`
 * em todos: o Service já aplica seus próprios defaults/tetos
 * (`DEFAULT_LIST_LIMIT`/`MAX_LIST_LIMIT`), o Router não duplica esses
 * valores (mesmo padrão de `historyQuerySchema` em `whatsAppSessionsRouter`).
 */
const listConversationsQuerySchema = z.object({
  status: z.enum(['bot', 'human']).optional(),
  limit: z.coerce.number().int().positive().optional(),
  cursor: z.string().trim().min(1).optional(),
});

const listMessagesQuerySchema = z.object({ limit: z.coerce.number().int().positive().optional() });

/**
 * Corpo do `POST .../messages` (feature N2 — resposta do operador). `content`
 * não-vazio (após trim) e com teto de 4096 caracteres — mesmo limite de
 * `DEFAULT_MAX_REPLY_LENGTH` do `ReplyValidator` da IA, mantendo o mesmo teto
 * para mensagens humanas e da IA.
 */
const sendMessageBodySchema = z.object({
  content: z.string().trim().min(1, 'A mensagem não pode ser vazia.').max(4096, 'A mensagem é longa demais (máx. 4096 caracteres).'),
});

/**
 * Router REST (Presentation, Milestone 3, Bloco 5) para o ciclo de vida de
 * uma `Conversation` — escalonar/retomar atendimento e listar
 * conversas/mensagens de um tenant, via `ConversationsService`. Mesmos
 * princípios de `whatsAppSessionsRouter.ts` (D18 do levantamento
 * arquitetural — thin router, sem classe `Controller` separada, validação
 * Zod ANTES de qualquer chamada ao Service, `{ mergeParams: true }` porque
 * este router é montado em `/api/tenants/:tenantId/conversations`).
 *
 * `POST .../escalate` e `.../resume` respondem 200 (não 201/204): a
 * operação é idempotente e devolve a `Conversation` atualizada — mesmo
 * racional de `POST /` em `whatsAppSessionsRouter` (reconectar/reafirmar um
 * estado, não criar um recurso novo).
 */
export function createConversationsRouter(conversationsService: ConversationsService): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const query = validateOrRespond(listConversationsQuerySchema, req.query, res);
      if (!query) return;

      const page = await conversationsService.listConversations(params.tenantId, query);
      res.status(200).json(page);
    }),
  );

  router.get(
    '/:conversationId/messages',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema.merge(conversationIdParamSchema), req.params, res);
      if (!params) return;
      const query = validateOrRespond(listMessagesQuerySchema, req.query, res);
      if (!query) return;

      const messages = await conversationsService.listMessages(params.tenantId, params.conversationId, query.limit);
      res.status(200).json({ messages });
    }),
  );

  router.post(
    '/:conversationId/escalate',
    requirePermission('conversation:escalate'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema.merge(conversationIdParamSchema), req.params, res);
      if (!params) return;

      const conversation = await conversationsService.escalateConversation(
        params.tenantId,
        params.conversationId,
        toActor(req),
        toMeta(req),
      );
      res.status(200).json(conversation);
    }),
  );

  router.post(
    '/:conversationId/messages',
    requirePermission('message:send'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema.merge(conversationIdParamSchema), req.params, res);
      if (!params) return;
      const body = validateOrRespond(sendMessageBodySchema, req.body, res);
      if (!body) return;

      await conversationsService.sendAgentMessage(params.tenantId, params.conversationId, body.content, toActor(req), toMeta(req));
      // 202 Accepted: a mensagem foi ENFILEIRADA para envio; a Message aparece
      // na timeline via o tempo real depois que o consumer entrega (N2).
      res.status(202).json({ status: 'queued' });
    }),
  );

  router.post(
    '/:conversationId/resume',
    // Permissao base `resume_own` (Operator+); o refinamento "so a propria vs.
    // a de qualquer um" (Operator vs. Manager+) e feito no Service via
    // `canResumeAny` + ownership (M5D/D57).
    requirePermission('conversation:resume_own'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema.merge(conversationIdParamSchema), req.params, res);
      if (!params) return;

      const conversation = await conversationsService.resumeConversation(
        params.tenantId,
        params.conversationId,
        toActor(req),
        toMeta(req),
      );
      res.status(200).json(conversation);
    }),
  );

  return router;
}
