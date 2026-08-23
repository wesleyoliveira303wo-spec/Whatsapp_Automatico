import { Router, raw, Request } from 'express';
import { z } from 'zod';

import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';
import { RequestWithPrincipal } from '../../../shared/presentation/authenticate';
import { ContactRepository } from '../domain/repositories/ContactRepository';
import { ContactImportService } from '../application/ContactImportService';
import { ContactConsentService } from '../application/ContactConsentService';
import { normalizePhoneToE164 } from '../domain/phoneNumber';
import { ContactNotFoundError } from '../domain/errors/ContactNotFoundError';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio'),
});

const contactIdParamSchema = z.object({
  contactId: z.string().trim().min(1, 'contactId não pode ser vazio'),
});

const listContactsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  status: z.enum(['with_conversation', 'without_conversation', 'opted_out']).optional(),
});

/** Reorganização Contatos/Campanhas (2026-08-17) — criação manual de um único contato. */
const createContactBodySchema = z.object({
  phone: z.string().trim().min(1, 'phone não pode ser vazio'),
  name: z.string().trim().min(1).max(200).optional(),
});

/** `PATCH /:contactId` — pelo menos um dos dois campos precisa estar presente. */
const updateContactBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.name !== undefined || data.phone !== undefined, {
    message: 'Informe ao menos um campo para editar (name ou phone).',
  });

/**
 * `userId` de quem está autenticado, quando é uma PESSOA (plano máquina —
 * chave do tenant — não tem `userId`). Usado só para `actorUserId` no log de
 * consentimento (Fase L, Bloco L2): opt-in/opt-out manual pelo plano máquina
 * continua funcionando, só fica sem um ator humano identificado no log —
 * mesmo tratamento que auditoria de outras ações deste projeto já dá ao
 * plano máquina.
 */
function actorUserId(req: Request): string | undefined {
  const principal = (req as RequestWithPrincipal).principal;
  return principal && principal.kind === 'user' ? principal.userId : undefined;
}

/** Teto de tamanho do corpo do upload — texto puro, então bem mais generoso que mídia binária; 5.000 linhas cabem folgadamente aqui. */
export const MAX_IMPORT_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Router REST de contatos — Fase L, Blocos L1/L1b.
 *
 * Montado sob `/api/tenants/:tenantId/contacts` (tenant-wide, DIFERENTE de
 * `tagRouter`/`quickReplyRouter`, que são por sessão — ver docstring de
 * `WhatsAppContact` no `schema.prisma`: um contato não pertence a uma sessão).
 *
 * RBAC POR ROTA: `GET` exige `contact:read` (operator+, já pode ver leads
 * enquanto atende); `POST .../import` exige `contact:manage`
 * (administrator+) — uma importação em lote pode poluir a base do tenant
 * inteiro, mesmo nível de risco já usado para `ai_profile:update`/
 * `quick_reply:manage`.
 */
export function createContactsRouter(
  contactRepository: ContactRepository,
  contactImportService: ContactImportService,
  contactConsentService: ContactConsentService,
): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    requirePermission('contact:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const query = validateOrRespond(listContactsQuerySchema, req.query, res);
      if (!query) return;

      const page = await contactRepository.listByTenant(params.tenantId, {
        limit: query.limit ?? 20,
        cursor: query.cursor,
        search: query.search,
        status: query.status,
      });
      res.status(200).json(page);
    }),
  );

  /**
   * `POST /` — cria um contato manualmente (Reorganização Contatos/Campanhas,
   * 2026-08-17: a tela de Contatos vira um CRUD de verdade). Mesma
   * deduplicação por telefone de sempre (`findOrCreateByPhone`): se o
   * telefone já é um contato existente, ele é devolvido como está (nome
   * já definido nunca é sobrescrito) — `wasCreated` avisa a UI qual dos
   * dois casos aconteceu, sem inventar um segundo endpoint.
   */
  router.post(
    '/',
    requirePermission('contact:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(createContactBodySchema, req.body, res);
      if (!body) return;

      const phoneE164 = normalizePhoneToE164(body.phone);
      if (!phoneE164) {
        res.status(400).json({
          error: 'invalid_phone',
          message: 'Telefone inválido — confira o DDD e o número.',
        });
        return;
      }

      const existing = await contactRepository.findByPhone(params.tenantId, phoneE164);
      const contact = await contactRepository.findOrCreateByPhone({
        tenantId: params.tenantId,
        phoneE164,
        name: body.name,
        source: 'manual',
      });
      res.status(existing ? 200 : 201).json({ contact, wasCreated: !existing });
    }),
  );

  /**
   * `GET .../stats` — contagens da base para os cards do topo da tela
   * (retrofit 2026-08-16). Mesma permissão da listagem: quem pode ver a
   * base pode ver o tamanho dela.
   *
   * Registrado ANTES de qualquer rota com `:contactId` porque o Express casa
   * na ordem de declaração — sem isso, `/stats` seria interpretado como um
   * `contactId` chamado "stats".
   */
  router.get(
    '/stats',
    requirePermission('contact:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;

      const stats = await contactRepository.countStats(params.tenantId);
      res.status(200).json(stats);
    }),
  );

  /**
   * `POST .../import` — corpo é o TEXTO CRU do CSV (não JSON, não
   * multipart). `raw({ type: () => true, limit })` substitui o
   * `express.json()` global só para esta rota, mesmo padrão de
   * `POST .../media` em `conversationsRouter`: aceita qualquer
   * `Content-Type` (o navegador manda `text/csv` ou `application/vnd.ms-excel`
   * dependendo do sistema operacional, nunca `application/json`), e o Express
   * já rejeita com `413` antes do handler rodar se exceder o teto.
   */
  router.post(
    '/import',
    requirePermission('contact:manage'),
    raw({ type: () => true, limit: MAX_IMPORT_UPLOAD_BYTES }),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({
          error: 'empty_body',
          message: 'O corpo da requisição precisa ser o arquivo CSV (não vazio).',
        });
        return;
      }

      const report = await contactImportService.importCsv(
        params.tenantId,
        req.body.toString('utf-8'),
      );
      res.status(200).json(report);
    }),
  );

  /**
   * `PATCH .../:contactId` — edita nome e/ou telefone (Reorganização
   * Contatos/Campanhas, 2026-08-17). Mesma permissão de `/import`
   * (`contact:manage`): editar a identidade de um contato é gestão da base.
   */
  router.patch(
    '/:contactId',
    requirePermission('contact:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(contactIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(updateContactBodySchema, req.body, res);
      if (!body) return;

      let phoneE164: string | undefined;
      if (body.phone !== undefined) {
        phoneE164 = normalizePhoneToE164(body.phone);
        if (!phoneE164) {
          res.status(400).json({
            error: 'invalid_phone',
            message: 'Telefone inválido — confira o DDD e o número.',
          });
          return;
        }
      }

      const contact = await contactRepository.update(params.tenantId, params.contactId, {
        name: body.name,
        phoneE164,
      });
      if (!contact) {
        throw new ContactNotFoundError(params.contactId);
      }
      res.status(200).json({ contact });
    }),
  );

  /** `DELETE .../:contactId` — remove o contato definitivamente. Não apaga histórico de conversa (ver docstring do port). */
  router.delete(
    '/:contactId',
    requirePermission('contact:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(contactIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const deleted = await contactRepository.deleteById(params.tenantId, params.contactId);
      if (!deleted) {
        throw new ContactNotFoundError(params.contactId);
      }
      res.status(204).send();
    }),
  );

  /**
   * `POST .../:contactId/opt-out` — opt-out MANUAL (o automático, por
   * palavra-chave, acontece dentro da ingestão de mensagem, sem rota HTTP).
   * Mesma permissão de `/import` (`contact:manage`): é uma ação de gestão da
   * base, não de atendimento do dia a dia.
   */
  router.post(
    '/:contactId/opt-out',
    requirePermission('contact:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(contactIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const contact = await contactConsentService.recordOptOut(
        params.tenantId,
        params.contactId,
        'manual',
        actorUserId(req),
      );
      res.status(200).json({ contact });
    }),
  );

  /** `POST .../:contactId/opt-in` — reverte um opt-out (manual ou automático). */
  router.post(
    '/:contactId/opt-in',
    requirePermission('contact:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(contactIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const contact = await contactConsentService.recordOptIn(
        params.tenantId,
        params.contactId,
        actorUserId(req),
      );
      res.status(200).json({ contact });
    }),
  );

  return router;
}
