import { NextFunction, Request, RequestHandler, Response } from 'express';

import { PublicPlatformUser } from '../domain/entities/PlatformUser';
import { PlatformSessionTokenService } from '../domain/PlatformSessionTokenService';
import { PlatformAuthService } from '../application/PlatformAuthService';

const AUTHORIZATION_HEADER = 'authorization';
const BEARER_PREFIX = 'Bearer ';

/** Requisição já autenticada como dono da plataforma. */
export interface RequestWithPlatformUser extends Request {
  platformUser?: PublicPlatformUser;
}

/**
 * Porteiro de `/api/platform/...` — Fase 1.
 *
 * Vive em `services/platform` (e NÃO em `shared/presentation`, como
 * `requireUser`) de propósito: nenhum outro bounded context deve conseguir
 * montar uma rota que atravessa tenants. Enquanto este porteiro só for
 * importável daqui, "que código pode ver dados de todos os clientes?" segue
 * respondível com um `grep` no diretório (§3.3 do plano mestre).
 *
 * Diferença deliberada em relação ao porteiro de tenant: assinatura válida
 * NÃO basta — a cada requisição o admin é relido do banco. É o que faz uma
 * conta suspensa perder o acesso na hora, em vez de continuar entrando até o
 * crachá expirar. O custo é uma consulta por requisição, irrelevante num
 * painel de um usuário só, e é exatamente o que o plano pede em §4
 * ("expiração verificada no servidor a cada requisição").
 */
export function createRequirePlatformUser(
  tokenService: PlatformSessionTokenService,
  authService: PlatformAuthService,
): RequestHandler {
  return function requirePlatformUser(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers[AUTHORIZATION_HEADER];
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      res.status(401).json({
        error: 'missing_platform_session',
        message: 'Sessão de plataforma obrigatória.',
      });
      return;
    }

    const claims = tokenService.verify(header.slice(BEARER_PREFIX.length).trim());
    if (!claims) {
      res.status(401).json({
        error: 'invalid_platform_session',
        message: 'Sessão inválida ou expirada.',
      });
      return;
    }

    void authService
      .describe(claims.platformUserId)
      .then((user) => {
        // Some do banco ou deixou de estar ativo: mesma resposta de crachá
        // inválido — nada aqui distingue "sumiu" de "suspenso".
        if (!user) {
          res.status(401).json({
            error: 'invalid_platform_session',
            message: 'Sessão inválida ou expirada.',
          });
          return;
        }
        (req as RequestWithPlatformUser).platformUser = user;
        next();
      })
      .catch(next);
  };
}
