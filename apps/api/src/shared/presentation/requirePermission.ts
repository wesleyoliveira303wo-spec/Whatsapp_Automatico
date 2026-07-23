import { NextFunction, Request, RequestHandler, Response } from 'express';
import { Permission, hasPermission } from '../../services/auth/domain/permissions';
import { RequestWithPrincipal } from './authenticate';

/**
 * Middleware que exige uma PERMISSAO (o "segurança do cargo") — Milestone 5,
 * Bloco M5D. Roda DEPOIS do `authenticate` (que ja resolveu `req.principal`).
 *
 * Regra:
 * - Plano MAQUINA (chave da empresa): LIBERA tudo — e o lado confiavel
 *   (worker/integracoes), fora do RBAC humano por decisao de arquitetura.
 * - Plano PESSOA: confere o cargo na regua (`hasPermission`). Sem a permissao
 *   -> 403.
 * - Sem `principal` (authenticate nao rodou antes): 401 — erro de montagem,
 *   nunca deveria acontecer em producao.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return function requirePermissionMiddleware(req: Request, res: Response, next: NextFunction): void {
    const principal = (req as RequestWithPrincipal).principal;
    if (!principal) {
      res.status(401).json({ error: 'not_authenticated', message: 'Autenticacao obrigatoria.' });
      return;
    }
    if (principal.kind === 'machine') {
      next();
      return;
    }
    if (!hasPermission(principal.role, permission)) {
      res.status(403).json({ error: 'forbidden', message: 'Seu cargo nao permite esta acao.' });
      return;
    }
    next();
  };
}
