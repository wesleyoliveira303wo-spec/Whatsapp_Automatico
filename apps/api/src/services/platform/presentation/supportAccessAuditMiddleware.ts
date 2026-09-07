import { NextFunction, Request, RequestHandler, Response } from 'express';

import { Logger } from '../../../shared/domain/Logger';
import { RequestWithPrincipal } from '../../../shared/presentation/authenticate';
import { AuditLogRepository } from '../../auth/domain/repositories/AuditLogRepository';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Rastro de auditoria durante o acesso assistido — Painel `/admin`, Fase 5
 * (`ADMIN_PLATFORM_MASTER_PLAN.md` §11).
 *
 * Montado logo DEPOIS do `authenticate`, no pipeline `/api/tenants/:tenantId`.
 * Quando o ator é do plano `support` e a requisição MUTA algo
 * (POST/PUT/PATCH/DELETE), grava uma linha no `AuditLog` DO TENANT com
 * `supportAccessId` em `metadata` — é o que o cliente vê depois na Auditoria
 * dele, e o que faz o rastro sobreviver ao fim da janela (§9.4 brecha 2:
 * campanha disparada no fim do prazo continua, mas o `POST .../campaigns` já
 * ficou logado).
 *
 * Trade-off registrado (ver `CLAUDE.md` §18): a linha descreve a REQUISIÇÃO
 * HTTP (`method` + `path`), não a ação de domínio. Combinada com os eventos de
 * fronteira `support.access_granted`/`support.access_ended`, "o que foi feito
 * naquele acesso" é uma consulta direta. Threading `supportAccessId` por cada
 * serviço de domínio fica como evolução, se o volume justificar.
 *
 * Falha ao gravar nunca derruba a requisição do cliente — só loga.
 */
export function createSupportAccessAuditMiddleware(
  auditLogRepository: AuditLogRepository,
  logger: Logger,
): RequestHandler {
  return function supportAccessAudit(req: Request, res: Response, next: NextFunction): void {
    const principal = (req as RequestWithPrincipal).principal;
    if (
      !principal ||
      principal.kind !== 'support' ||
      !MUTATING_METHODS.has((req.method ?? '').toUpperCase())
    ) {
      next();
      return;
    }

    const ua = req.headers['user-agent'];
    void auditLogRepository
      .record({
        tenantId: principal.tenantId,
        action: 'support.action',
        metadata: {
          supportAccessId: principal.supportAccessId,
          platformUserId: principal.platformUserId,
          method: req.method,
          // `baseUrl` + `path` — sem query string (pode carregar ids/segredos).
          path: `${req.baseUrl}${req.path}`,
        },
        ip: req.ip,
        userAgent: typeof ua === 'string' ? ua : undefined,
      })
      .catch((error) => {
        logger.error('Falha ao registrar ação de suporte na auditoria do tenant', { error });
      });

    next();
  };
}
