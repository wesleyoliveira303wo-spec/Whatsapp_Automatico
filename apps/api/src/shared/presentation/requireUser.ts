import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AccessTokenClaims, AccessTokenService } from '../../services/auth/domain/AccessTokenService';

const AUTHORIZATION_HEADER = 'authorization';
const BEARER_PREFIX = 'Bearer ';

/**
 * Enriquecimento de `Request` com o USUARIO ja autenticado (o "cracha" lido).
 * Rotas protegidas leem `req.authUser` sem repetir a verificacao do token —
 * mesmo padrao de `RequestWithTenant` (requireApiKey).
 */
export interface RequestWithAuthUser extends Request {
  authUser?: AccessTokenClaims;
}

/**
 * Middleware Express que confere o CRACHA DE ACESSO (o "seguranca da porta")
 * — Milestone 5, Bloco M5C. Le o header `Authorization: Bearer <token>`,
 * valida via `AccessTokenService` (assinatura/expiracao/alg), e anexa o
 * usuario em `req.authUser`.
 *
 * Vive em `shared/presentation` (nao em `services/auth`) pelo mesmo motivo de
 * `requireApiKey` (D9): no M5D varias salas de OUTROS bounded contexts
 * (conversas, sessoes, analytics) vao consumi-lo — colocar em `services/auth`
 * criaria acoplamento lateral. Construido por fabrica (recebe o
 * `AccessTokenService`), nunca instancia nada — mesmo padrao de
 * `createRequireApiKey`.
 *
 * Responsabilidades, nesta ordem:
 * 1. Extrair o Bearer token — ausente/mal formatado -> 401.
 * 2. Validar o token -> invalido/expirado -> 401.
 * 3. Se a rota tiver `:tenantId` no path, confirmar que o tenant do cracha e o
 *    MESMO da URL -> divergencia -> 403 (mesma defesa de IDOR do requireApiKey:
 *    um cracha valido de uma empresa nao acessa rota de OUTRA so trocando a URL).
 * 4. Anexar `req.authUser` e chamar `next()`.
 */
export function createRequireUser(accessTokenService: AccessTokenService): RequestHandler {
  return function requireUser(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers[AUTHORIZATION_HEADER];
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      res.status(401).json({ error: 'missing_access_token', message: 'Cabecalho Authorization: Bearer e obrigatorio.' });
      return;
    }

    const token = header.slice(BEARER_PREFIX.length).trim();
    const claims = accessTokenService.verify(token);
    if (!claims) {
      res.status(401).json({ error: 'invalid_access_token', message: 'Cracha de acesso invalido ou expirado.' });
      return;
    }

    const tenantIdFromPath = req.params.tenantId;
    if (tenantIdFromPath !== undefined && tenantIdFromPath !== claims.tenantId) {
      res.status(403).json({ error: 'tenant_mismatch', message: 'O cracha nao autoriza acesso a este tenant.' });
      return;
    }

    (req as RequestWithAuthUser).authUser = claims;
    next();
  };
}
