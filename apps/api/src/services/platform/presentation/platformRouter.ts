import { Router, RequestHandler } from 'express';
import { z } from 'zod';

import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { PlatformAuthService } from '../application/PlatformAuthService';
import { PlatformSessionTokenService } from '../domain/PlatformSessionTokenService';
import { RequestWithPlatformUser } from './requirePlatformUser';

const loginBodySchema = z.object({
  email: z.string().trim().min(1, 'informe o e-mail'),
  password: z.string().min(1, 'informe a senha'),
});

/**
 * Rotas do `/admin` — Fase 1 (`ADMIN_PLATFORM_MASTER_PLAN.md` §15). Thin
 * router (D18): só Zod, chamada ao Application Service e resposta HTTP.
 *
 * Montado em `/api/platform`, sem `:tenantId` no caminho — a diferença de
 * formato de URL é parte da separação entre os dois porteiros (§3.2), não
 * cosmética: nenhuma rota daqui tem "tenant do path" que um atacante possa
 * trocar.
 *
 * `/login` fica FORA do porteiro (é pré-autenticação, e é justamente onde os
 * dois freios do Bloco B1 — por IP e por identidade — se aplicam); `/me` e
 * `/logout` exigem sessão válida.
 */
export function createPlatformRouter(
  authService: PlatformAuthService,
  tokenService: PlatformSessionTokenService,
  requirePlatformUser: RequestHandler,
  loginGuards: RequestHandler[] = [],
): Router {
  const router = Router();

  router.post(
    '/auth/login',
    ...loginGuards,
    asyncHandler(async (req, res) => {
      const body = validateOrRespond(loginBodySchema, req.body, res);
      if (!body) return;

      // Credencial inválida e conta trancada saem como exceção, traduzidas
      // num lugar só pelo `platformErrorHandler`.
      const user = await authService.login(body.email, body.password, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(200).json({ token: tokenService.issue({ platformUserId: user.id }), user });
    }),
  );

  router.get('/auth/me', requirePlatformUser, (req, res) => {
    // O porteiro já releu o admin do banco — aqui é só devolver.
    res.status(200).json({ user: (req as RequestWithPlatformUser).platformUser });
  });

  router.post(
    '/auth/logout',
    requirePlatformUser,
    asyncHandler(async (req, res) => {
      const user = (req as RequestWithPlatformUser).platformUser;
      if (user) {
        await authService.logout(user.id, { ip: req.ip, userAgent: req.headers['user-agent'] });
      }
      // Quem descarta o cookie é o BFF. O crachá é curto e sem estado no
      // servidor, então "sair" aqui é registrar a saída na trilha — uma lista
      // de revogação só se justifica quando houver mais de um admin e sessões
      // longas, o que não é o caso (§15, Fase 1).
      res.status(204).end();
    }),
  );

  return router;
}
