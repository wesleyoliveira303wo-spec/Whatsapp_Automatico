import { Router, Request } from 'express';
import { z } from 'zod';
import {
  WhatsAppSessionService,
  WhatsAppSessionActor,
} from '../application/WhatsAppSessionService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';
import { RequestWithPrincipal } from '../../../shared/presentation/authenticate';
import { ContactAvatarService } from '../application/ContactAvatarService';
import { WhatsAppGroupDirectoryService } from '../application/WhatsAppGroupDirectoryService';

/** Milestone 5, Bloco M5D-3 — traduz o `principal` no ator para auditoria. Plano máquina/sem principal = sem `userId`. */
function toActor(req: Request): WhatsAppSessionActor {
  const principal = (req as RequestWithPrincipal).principal;
  // `machine` e `support` (Fase 5 do /admin) = planos confiáveis, sem `userId`.
  if (!principal || principal.kind !== 'user') {
    return {};
  }
  return { userId: principal.userId };
}

function toMeta(req: Request): { userAgent?: string; ip?: string } {
  const userAgent = req.headers['user-agent'];
  return { userAgent: typeof userAgent === 'string' ? userAgent : undefined, ip: req.ip };
}

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});
const sessionNameParamSchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName não pode ser vazio'),
});
/** Milestone 6, Bloco M6H-2b — JID do contato (ex.: `5511999999999@s.whatsapp.net`), sempre URL-encoded pelo chamador (ver BFF `.../avatar.ts`). */
const contactJidParamSchema = z.object({
  contactJid: z.string().trim().min(1, 'contactJid não pode ser vazio'),
});
const createSessionBodySchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName não pode ser vazio'),
});
/**
 * M2, Fase 2 — `limit` é opcional e vem de query string (`?limit=`), sempre
 * uma string nesse ponto; `z.coerce.number()` converte antes de validar
 * `.int().positive()`. `.optional()` deixa `undefined` passar (o Service já
 * aplica seu próprio default, `DEFAULT_HISTORY_LIMIT` — o Router não
 * duplica esse valor).
 */
const historyQuerySchema = z.object({ limit: z.coerce.number().int().positive().optional() });

/**
 * Bloco B2 (issue #13) — corpo da consulta de fotos EM LOTE. O teto de 300
 * existe para uma tela nunca virar uma consulta gigante: a lista de
 * Conversas carrega algumas dezenas de linhas por vez, e um pedido muito
 * maior que isso é sinal de uso indevido, não de tela cheia.
 */
const contactAvatarsBodySchema = z.object({
  contactJids: z.array(z.string().trim().min(1)).min(1).max(300),
});

/** Disparos em grupos (2026-09-11) — `?refresh=true` pede para ignorar o cache (respeitando o piso de `GROUP_DIRECTORY_MIN_REFRESH_MS`). */
const listGroupsQuerySchema = z.object({
  refresh: z.enum(['true', 'false']).optional(),
});

// `asyncHandler`/`validateOrRespond` extraídos para `shared/presentation/httpHelpers`
// na Milestone 3, Bloco 5 (D9/D16) — ver docstring do arquivo de destino:
// mesmo critério de "extrair quando o segundo consumidor aparecer" já usado
// para `requireApiKey`, agora aplicado a estas duas funções.

/**
 * Router REST (Presentation, Item 5 - Bloco 7; atualizado na Production
 * Hardening, Bloco 7) para o ciclo de vida de uma sessão do WhatsApp, via
 * `WhatsAppSessionService` (Production Hardening, Bloco 5) — não mais via
 * `WhatsAppConnectionRegistry` diretamente. Recebe o Service pronto (injeção
 * de dependência) — não constrói nenhuma peça de Infrastructure nem conhece
 * `TenantRepository`/`WhatsAppConnectionRegistry`; isso é responsabilidade do
 * composition root (`createWhatsAppSessionsComposition`).
 *
 * Por que a troca: `WhatsAppConnectionRegistry` nunca validou a existência do
 * tenant (nunca foi sua responsabilidade — ver docstring de
 * `WhatsAppSessionService`); rotear direto para o Registry, mesmo por trás de
 * `requireApiKey`, deixaria o `sessionName` operar sobre um `tenantId`
 * qualquer sem checar se ele existe de fato. Delegar a `WhatsAppSessionService`
 * garante essa validação (`assertTenantExists`) antes de qualquer operação —
 * o Router continua sem saber COMO essa validação é feita, só que ela
 * acontece.
 *
 * `{ mergeParams: true }`: este router é montado em
 * `/api/tenants/:tenantId/whatsapp-sessions` (ver composition root) — sem
 * essa opção, `req.params.tenantId` do path de montagem não apareceria em
 * `req.params` dentro das rotas abaixo (comportamento padrão do Express).
 *
 * Validação via Zod acontece ANTES de qualquer chamada ao Service — nunca
 * delegada aos `Error`s genéricos de `WhatsAppSessionKey`/`TenantNotFoundError`,
 * que não têm semântica HTTP (mesmo racional do Bloco 4 para erros nomeados).
 *
 * `POST` responde 200 (não 201): a operação é idempotente — reconecta uma
 * sessão existente em vez de sempre criar uma nova (`SessionManager.init()`,
 * ADR #23/#29) — e não há, no contrato atual, um jeito de saber se foi
 * "criação" ou "reconexão" sem expandir esse contrato, o que está fora do
 * escopo deste bloco.
 */
export function createWhatsAppSessionsRouter(
  sessionService: WhatsAppSessionService,
  /**
   * Bloco B2 (issue #13) — opcional para não quebrar nenhum chamador
   * existente (inclusive testes que só exercitam o ciclo de vida da sessão).
   * Ausente, a rota em lote responde 503: melhor dizer "não configurado" do
   * que servir uma lista vazia que a UI leria como "ninguém tem foto".
   */
  contactAvatarService?: ContactAvatarService,
  /**
   * Disparos em grupos (2026-09-11) — opcional pelo mesmo motivo de
   * `contactAvatarService`: ausente, a rota de grupos responde 503.
   */
  groupDirectoryService?: WhatsAppGroupDirectoryService,
): Router {
  const router = Router({ mergeParams: true });

  /**
   * M2, Fase 1 — lista todas as sessões do tenant (suporte à tela de lista
   * do Dashboard). `GET /` não colide com `GET /:sessionName` abaixo: são
   * padrões de path distintos (0 vs. 1 segmento), o Express despacha pelo
   * casamento exato de cada um, não por ordem de declaração entre eles.
   */
  router.get(
    '/',
    requirePermission('session:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;

      const sessions = await sessionService.listSessions(params.tenantId);
      res.status(200).json({ sessions });
    }),
  );

  router.post(
    '/',
    requirePermission('session:connect'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(createSessionBodySchema, req.body, res);
      if (!body) return;

      const session = await sessionService.initSession(
        params.tenantId,
        body.sessionName,
        toActor(req),
        toMeta(req),
      );
      res.status(200).json(session);
    }),
  );

  router.get(
    '/:sessionName',
    requirePermission('session:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const session = await sessionService.getSessionStatus(params.tenantId, params.sessionName);
      res.status(200).json(session);
    }),
  );

  router.get(
    '/:sessionName/qrcode',
    requirePermission('session:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const qrCode = await sessionService.getSessionQRCode(params.tenantId, params.sessionName);
      res.status(200).json({ qrCode });
    }),
  );

  /**
   * Milestone 6, Bloco M6H-2b — foto de perfil de um contato desta sessão,
   * consultada ao vivo no provider (nunca persistida — ver
   * `WhatsAppProvider.getProfilePictureUrl`). Mesma permissão de leitura de
   * sessão (`session:read`): quem já pode ver a sessão pode ver as fotos dos
   * contatos que conversam com ela. `avatarUrl: undefined` (nunca 404) é uma
   * resposta válida — a UI trata como "sem foto", não como erro.
   */
  /**
   * Bloco B2 (issue #13) — fotos de perfil EM LOTE, servidas do cache do
   * servidor. É a rota que as listas (Conversas, Pipeline, Contatos) usam:
   * uma requisição por tela, nunca uma por linha.
   *
   * NUNCA toca o socket Baileys no caminho da requisição — o que falta ou
   * venceu é atualizado em segundo plano, com teto de concorrência (ver
   * `ContactAvatarService` e a ADR #78, que registra o socket travado por
   * uma consulta de foto).
   *
   * `POST` para uma leitura é deliberado: a lista de JIDs passa fácil do que
   * cabe com folga numa query string, e cada JID já é um valor longo. Mesma
   * permissão da rota de foto individual (`session:read`).
   *
   * Declarada ANTES de `/:sessionName/contacts/:contactJid/avatar` por
   * disciplina de ordem (não há colisão real — são 2 e 3 segmentos).
   */
  router.post(
    '/:sessionName/contacts/avatars',
    requirePermission('session:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(contactAvatarsBodySchema, req.body, res);
      if (!body) return;

      if (!contactAvatarService) {
        res.status(503).json({ error: 'contact_avatar_cache_unavailable' });
        return;
      }

      const avatars = await contactAvatarService.listAvatars(
        params.tenantId,
        params.sessionName,
        body.contactJids,
      );
      res.status(200).json({ avatars });
    }),
  );

  router.get(
    '/:sessionName/contacts/:contactJid/avatar',
    requirePermission('session:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema).merge(contactJidParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const avatarUrl = await sessionService.getContactAvatarUrl(
        params.tenantId,
        params.sessionName,
        params.contactJid,
      );
      res.status(200).json({ avatarUrl });
    }),
  );

  /**
   * Disparos em grupos (2026-09-11) — grupos dos quais o número desta sessão
   * participa, para o operador escolher onde publicar.
   *
   * `campaign:manage` (não `session:read`): o ÚNICO uso desta lista é montar
   * um disparo em grupos, que já exige `campaign:manage`. Restringir a quem
   * pode disparar também restringe quem pode provocar a consulta IQ no socket
   * compartilhado (ADR #78) — o cache/deduplicação de
   * `WhatsAppGroupDirectoryService` já protege, isto só reduz a superfície.
   *
   * Sessão sem conexão viva → 409; WhatsApp não respondeu a tempo → 504 (ver
   * `whatsAppErrorHandler`). Nunca devolve lista vazia no lugar de um erro:
   * "você não está em nenhum grupo" e "não deu para perguntar" são coisas
   * diferentes para quem está montando um disparo.
   */
  router.get(
    '/:sessionName/groups',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const query = validateOrRespond(listGroupsQuerySchema, req.query, res);
      if (!query) return;

      if (!groupDirectoryService) {
        res.status(503).json({ error: 'group_directory_unavailable' });
        return;
      }

      const snapshot = await groupDirectoryService.listGroups(params.tenantId, params.sessionName, {
        forceRefresh: query.refresh === 'true',
      });
      res.status(200).json(snapshot);
    }),
  );

  /**
   * M2, Fase 2 (M2-B5) — histórico recente de transições de status. Leitura
   * pura, não interfere em nenhuma outra rota; funciona mesmo depois de
   * `DELETE /:sessionName/remove` (ver docstring de
   * `WhatsAppSessionEvent`/`getSessionHistory()`: o histórico sobrevive
   * deliberadamente à remoção da sessão).
   */
  router.get(
    '/:sessionName/history',
    requirePermission('session:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const query = validateOrRespond(historyQuerySchema, req.query, res);
      if (!query) return;

      const events = await sessionService.getSessionHistory(
        params.tenantId,
        params.sessionName,
        query.limit,
      );
      res.status(200).json({ events });
    }),
  );

  router.delete(
    '/:sessionName',
    requirePermission('session:disconnect'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      await sessionService.disconnectSession(
        params.tenantId,
        params.sessionName,
        toActor(req),
        toMeta(req),
      );
      res.status(204).send();
    }),
  );

  /**
   * M2, Fase 1 — remoção definitiva (distinta de `DELETE /:sessionName`
   * acima, que só desconecta). Caminho separado (`/remove`) em vez de
   * reaproveitar o verbo `DELETE /:sessionName` com um parâmetro/query
   * diferenciador: `DELETE /:sessionName` já tem um contrato testado e
   * documentado ("desconecta, idempotente, 204") desde a Production
   * Hardening — mudar o que esse verbo/path fazem seria alterar um contrato
   * já aprovado, não estendê-lo.
   */
  router.delete(
    '/:sessionName/remove',
    requirePermission('session:remove'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(sessionNameParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      await sessionService.removeSession(
        params.tenantId,
        params.sessionName,
        toActor(req),
        toMeta(req),
      );
      res.status(204).send();
    }),
  );

  return router;
}
