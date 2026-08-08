import { Router, Request, raw } from 'express';
import { z } from 'zod';
import {
  ConversationsService,
  ConversationActor,
  MAX_AGENT_MEDIA_UPLOAD_BYTES,
} from '../application/ConversationsService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';
import { RequestWithPrincipal } from '../../../shared/presentation/authenticate';
import { hasPermission } from '../../auth/domain/permissions';
import { MessageContentType } from '../domain/entities/Message';

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
  return {
    userId: principal.userId,
    canResumeAny: hasPermission(principal.role, 'conversation:resume_any'),
  };
}

function toMeta(req: Request): { userAgent?: string; ip?: string } {
  const userAgent = req.headers['user-agent'];
  return { userAgent: typeof userAgent === 'string' ? userAgent : undefined, ip: req.ip };
}

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});
const conversationIdParamSchema = z.object({
  conversationId: z.string().trim().min(1, 'conversationId não pode ser vazio'),
});
/** Fase 1, Bloco F1.1 (ADR #90). */
const messageIdParamSchema = z.object({
  messageId: z.string().trim().min(1, 'messageId não pode ser vazio'),
});

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
  /** Milestone 6, Bloco M6H-2 — filtra por sessão de WhatsApp. */
  sessionName: z.string().trim().min(1).optional(),
  /**
   * Reforma do escalonamento (2026-07-25) — `?needsHumanAttention=true`
   * filtra só conversas com `escalatedAt` definido. `z.coerce.boolean()`
   * trataria `"false"` (string não-vazia) como `true` — por isso usa
   * `z.literal('true')` + `.transform()`, mesmo cuidado que qualquer outro
   * valor (`"false"`, ausente) vira `undefined` (não filtra), nunca `false`
   * explícito (o filtro não tem um modo "só as que NÃO precisam de atenção").
   */
  needsHumanAttention: z
    .literal('true')
    .optional()
    .transform((value) => (value === 'true' ? true : undefined)),
  /**
   * ADR #94 (2026-08-01) — `?excludedFromPipeline=true` lista só as
   * conversas marcadas como fora do funil; `?excludedFromPipeline=false`
   * lista só as que estão dentro do funil (usado pelo board Kanban, que
   * nunca deve mostrar as excluídas). Ausente = sem filtro (inbox geral).
   * Mesmo padrão `z.enum` + `.transform()` de `needsHumanAttention`, mas
   * aceitando os dois valores (aqui faz sentido filtrar pelos dois lados).
   */
  excludedFromPipeline: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

const listMessagesQuerySchema = z.object({ limit: z.coerce.number().int().positive().optional() });

/**
 * Corpo do `POST .../messages` (feature N2 — resposta do operador). `content`
 * não-vazio (após trim) e com teto de 4096 caracteres — mesmo limite de
 * `DEFAULT_MAX_REPLY_LENGTH` do `ReplyValidator` da IA, mantendo o mesmo teto
 * para mensagens humanas e da IA.
 */
const sendMessageBodySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'A mensagem não pode ser vazia.')
    .max(4096, 'A mensagem é longa demais (máx. 4096 caracteres).'),
});

/**
 * Headers do `POST .../media` (Fase 1, Bloco F1.3) — o corpo da requisição é
 * o ARQUIVO BRUTO (não JSON, não multipart/form-data — decisão registrada em
 * DECISIONS.md: evita depender de `multer`/parser multipart, nenhum
 * necessário até este bloco), então legenda/nome de arquivo/tipo viajam em
 * headers dedicados, prefixo `x-media-` para não colidir com nenhum header
 * HTTP padrão. `x-media-content-type` é DELIBERADAMENTE distinto do header
 * `Content-Type` nativo (que descreve o MIME do BINÁRIO, ex. `image/jpeg`) —
 * este aqui é a categoria do Domain (`image`/`audio`/`video`/`document`), que
 * o Baileys precisa saber para montar o payload certo
 * (`buildBaileysMediaContent`); um `Content-Type: image/jpeg` sozinho não
 * distingue, por exemplo, um PDF (`document`) de um MP4 (`video`) de forma
 * confiável o bastante para decidir a chave do payload do Baileys.
 */
const sendMediaHeadersSchema = z.object({
  'x-media-content-type': z.enum(['image', 'audio', 'video', 'document']),
  'content-type': z
    .string()
    .trim()
    .min(1, 'Content-Type é obrigatório para identificar o mimeType do arquivo.'),
  'x-media-caption': z.string().trim().max(1024).optional(),
  'x-media-filename': z.string().trim().max(255).optional(),
});

/**
 * Corpo do `POST .../stage` — pipeline de CRM (Milestone 6, Bloco M6H-5).
 * `stage` precisa ser exatamente um dos 5 valores da união literal do
 * Domain (`Conversation['stage']`) — qualquer outro valor falha a
 * validação Zod (400), nunca chega ao Service.
 */
const updateStageBodySchema = z.object({
  stage: z.enum(['new', 'contacted', 'negotiating', 'closed_won', 'closed_lost']),
});

/** Corpo do `POST .../exclude-from-pipeline` — ADR #94 (2026-08-01). */
const setExcludedFromPipelineBodySchema = z.object({
  excluded: z.boolean(),
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

  /**
   * `GET .../conversations/:conversationId` — Fase 1, Bloco F1.10 (estabilidade
   * para beta). Sem `requirePermission` explícito — mesma régua já aplicada a
   * `GET /` e `GET /:conversationId/messages` (leitura, não posse/escrita).
   * `ConversationsService.getConversation` já valida tenant ownership antes
   * de devolver; `ConversationNotFoundError` vira 404 via
   * `conversationsErrorHandler` (mesmo tratamento dos demais métodos).
   */
  router.get(
    '/:conversationId',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const conversation = await conversationsService.getConversation(
        params.tenantId,
        params.conversationId,
      );
      res.status(200).json(conversation);
    }),
  );

  router.get(
    '/:conversationId/messages',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const query = validateOrRespond(listMessagesQuerySchema, req.query, res);
      if (!query) return;

      const messages = await conversationsService.listMessages(
        params.tenantId,
        params.conversationId,
        query.limit,
      );
      res.status(200).json({ messages });
    }),
  );

  /**
   * `GET .../messages/:messageId/media` — Fase 1, Bloco F1.1 (ADR #90).
   * Streaming binário de verdade (`res.setHeader` + `res.send(Buffer)`),
   * NUNCA base64 embutido em JSON — primeiro endpoint deste projeto a
   * devolver um binário puro (todo outro endpoint devolve `res.json(...)`).
   * Sem `requirePermission` explícito — mesma régua já aplicada a `GET /` e
   * `GET /:conversationId/messages`: qualquer principal autenticado que já
   * pode ver a mensagem (texto) pode ver sua mídia; não é uma ação de
   * escrita/posse que justifique uma permissão própria.
   * `Cache-Control: private, max-age=3600`: o binário de uma mídia já
   * recebida nunca muda (é imutável por natureza — mesmo arquivo, mesma
   * `mediaKeyEncrypted`), então o navegador pode cachear com segurança;
   * `private` evita que um proxy/CDN compartilhado cacheie dado de um
   * tenant para servir a outro.
   */
  router.get(
    '/:conversationId/messages/:messageId/media',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema).merge(messageIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const media = await conversationsService.getMessageMedia(
        params.tenantId,
        params.conversationId,
        params.messageId,
      );
      res.setHeader('Content-Type', media.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      if (media.fileName) {
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(media.fileName)}"`,
        );
      }
      res.status(200).send(media.data);
    }),
  );

  router.post(
    '/:conversationId/escalate',
    requirePermission('conversation:escalate'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema),
        req.params,
        res,
      );
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
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(sendMessageBodySchema, req.body, res);
      if (!body) return;

      await conversationsService.sendAgentMessage(
        params.tenantId,
        params.conversationId,
        body.content,
        toActor(req),
        toMeta(req),
      );
      // 202 Accepted: a mensagem foi ENFILEIRADA para envio; a Message aparece
      // na timeline via o tempo real depois que o consumer entrega (N2).
      res.status(202).json({ status: 'queued' });
    }),
  );

  /**
   * `POST .../media` — envia uma mensagem de MÍDIA do OPERADOR (Fase 1,
   * Bloco F1.3). `raw({ type: () => true, limit })` substitui o
   * `express.json()` global SÓ para esta rota — `() => true` aceita QUALQUER
   * `Content-Type` (o do arquivo em si, ex. `image/jpeg`, nunca
   * `application/json`), então não há conflito com o parser global (que só
   * age sobre `Content-Type: application/json`, e simplesmente ignora
   * qualquer outro). `limit` igual a `MAX_AGENT_MEDIA_UPLOAD_BYTES` (mesmo
   * teto que `ConversationsService.sendAgentMediaMessage` valida de novo,
   * defesa em profundidade) — o `raw()` do Express já rejeita com `413`
   * ANTES de o handler rodar se o corpo exceder isso, mais barato que deixar
   * o Buffer inteiro chegar ao Service para só então descartá-lo.
   *
   * DIFERENTE de `POST .../messages` (202, assíncrono via fila): responde
   * SÍNCRONO — `200` com a `Message` criada em caso de sucesso (o operador
   * sabe na hora se o envio deu certo), ou o erro mapeado pelo
   * `conversationsErrorHandler` (413/404/409/502) se falhar.
   */
  router.post(
    '/:conversationId/media',
    requirePermission('message:send'),
    raw({ type: () => true, limit: MAX_AGENT_MEDIA_UPLOAD_BYTES }),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const headers = validateOrRespond(sendMediaHeadersSchema, req.headers, res);
      if (!headers) return;
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({
          error: 'empty_body',
          message: 'O corpo da requisição precisa ser o arquivo (não vazio).',
        });
        return;
      }

      const message = await conversationsService.sendAgentMediaMessage(
        params.tenantId,
        params.conversationId,
        {
          contentType: headers['x-media-content-type'] as Exclude<
            MessageContentType,
            'text' | 'sticker'
          >,
          buffer: req.body,
          mimeType: headers['content-type'],
          caption: headers['x-media-caption'],
          fileName: headers['x-media-filename'],
        },
        toActor(req),
        toMeta(req),
      );
      res.status(200).json(message);
    }),
  );

  router.post(
    '/:conversationId/read',
    // Indicador de não lidas (2026-07-25): qualquer pessoa que já pode VER a
    // conversa pode marcá-la como lida — reaproveita `conversation:read`
    // (mesma permissão que, na prática, já guarda `GET .../conversations`
    // via `requirePermission` no mount do router, ver composition root),
    // não `resume_own`/`escalate` (que são sobre ASSUMIR o atendimento, uma
    // ação de negócio distinta de simplesmente ler).
    requirePermission('conversation:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const conversation = await conversationsService.markAsRead(
        params.tenantId,
        params.conversationId,
      );
      res.status(200).json(conversation);
    }),
  );

  router.post(
    '/:conversationId/stage',
    // Pipeline de CRM (Milestone 6, Bloco M6H-5): mover um card no board não
    // é uma ação de POSSE do atendimento (diferente de escalate/resume) —
    // qualquer operador com permissão de dia a dia (`message:send`, mesma
    // permissão de responder pelo WhatsApp) pode reclassificar o estágio de
    // uma conversa, mesmo que outro tenha assumido o atendimento em si.
    requirePermission('message:send'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(updateStageBodySchema, req.body, res);
      if (!body) return;

      const conversation = await conversationsService.updateStage(
        params.tenantId,
        params.conversationId,
        body.stage,
        toActor(req),
        toMeta(req),
      );
      res.status(200).json(conversation);
    }),
  );

  router.post(
    '/:conversationId/exclude-from-pipeline',
    // ADR #94 (2026-08-01): mesma permissão de mover um card no Pipeline
    // (`message:send`) — não é ação de posse do atendimento, é classificação
    // operacional do dia a dia, qualquer operador pode marcar/desmarcar.
    requirePermission('message:send'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(setExcludedFromPipelineBodySchema, req.body, res);
      if (!body) return;

      const conversation = await conversationsService.setExcludedFromPipeline(
        params.tenantId,
        params.conversationId,
        body.excluded,
        toActor(req),
        toMeta(req),
      );
      res.status(200).json(conversation);
    }),
  );

  router.post(
    '/:conversationId/resume',
    // Permissao base `resume_own` (Operator+); o refinamento "so a propria vs.
    // a de qualquer um" (Operator vs. Manager+) e feito no Service via
    // `canResumeAny` + ownership (M5D/D57).
    requirePermission('conversation:resume_own'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema),
        req.params,
        res,
      );
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
