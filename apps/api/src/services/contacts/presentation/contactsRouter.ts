import { Router, raw, Request } from 'express';
import { z } from 'zod';

import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';
import { RequestWithPrincipal } from '../../../shared/presentation/authenticate';
import { ContactRepository } from '../domain/repositories/ContactRepository';
import { ContactImportService } from '../application/ContactImportService';
import { ContactConsentService } from '../application/ContactConsentService';

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
      });
      res.status(200).json(page);
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
