import { Router, RequestHandler } from 'express';
import { z } from 'zod';
import { AuthService } from '../application/AuthService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { RequestWithAuthUser } from '../../../shared/presentation/requireUser';
import { AccessTokenService } from '../domain/AccessTokenService';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId nao pode ser vazio'),
});
const loginBodySchema = z.object({ email: z.string().trim().min(1), password: z.string().min(1) });
const refreshBodySchema = z.object({ refreshToken: z.string().min(1) });
const logoutBodySchema = z.object({ refreshToken: z.string().min(1) });
const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

/**
 * Router de autenticacao (a "portaria") — Milestone 5, Bloco M5C. Thin router
 * (mesmo padrao D18): so Zod + chamada ao `AuthService` + resposta HTTP.
 * Montado em `/api/tenants/:tenantId/auth` SEM `requireApiKey` (login/refresh
 * sao pre-autenticacao; ver `index.ts`). `/me` e `/logout` exigem cracha
 * valido via `requireUser` (injetado), aplicado por rota.
 *
 * Falha de login/refresh -> 401 generico: nunca distingue email de senha
 * (anti-enumeracao).
 *
 * `loginRateLimiter` (opcional, Milestone 5, Bloco M5H): aplicado SOMENTE em
 * `/login` e `/refresh` — as duas rotas pre-autenticacao, unicos alvos de
 * forca bruta anonima. `/logout`, `/me` e `/change-password` ja exigem cracha
 * valido via `requireUser`, entao nao precisam desse freio.
 */
export function createAuthRouter(
  authService: AuthService,
  requireUser: RequestHandler,
  loginRateLimiter?: RequestHandler,
  accessTokenService?: AccessTokenService,
): Router {
  const router = Router({ mergeParams: true });

  const preAuthGuards: RequestHandler[] = loginRateLimiter ? [loginRateLimiter] : [];

  router.post(
    '/login',
    ...preAuthGuards,
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(loginBodySchema, req.body, res);
      if (!body) return;

      const meta = { userAgent: req.headers['user-agent'], ip: req.ip };
      const result = await authService.login(params.tenantId, body.email, body.password, meta);
      if (!result.ok) {
        res
          .status(401)
          .json({ error: 'invalid_credentials', message: 'E-mail ou senha invalidos.' });
        return;
      }
      res.status(200).json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    }),
  );

  router.post(
    '/refresh',
    ...preAuthGuards,
    asyncHandler(async (req, res) => {
      const body = validateOrRespond(refreshBodySchema, req.body, res);
      if (!body) return;

      const result = await authService.refresh(body.refreshToken);
      if (!result.ok) {
        res.status(401).json({
          error: 'invalid_refresh_token',
          message: 'Sessao expirada. Faca login novamente.',
        });
        return;
      }
      res.status(200).json({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    }),
  );

  // Logout NAO exige `requireUser` (R5 da auditoria de seguranca,
  // 2026-08-26): a revogacao acha o refresh token pelo HASH, nao pelo dono —
  // exigir um access token AINDA VALIDO so criava uma janela onde, se ele ja
  // tivesse expirado, o refresh token (ate 7 dias) sobrevivia ao "sair" do
  // usuario, e o BFF engolia o 401 em silencio. O Authorization e opcional
  // aqui: se vier e for valido, identifica o autor na auditoria; se faltar
  // ou estiver expirado, o logout revoga do mesmo jeito.
  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(logoutBodySchema, req.body, res);
      if (!body) return;

      let actorUserId: string | null = null;
      const header = req.headers.authorization;
      if (accessTokenService && typeof header === 'string' && header.startsWith('Bearer ')) {
        const claims = accessTokenService.verify(header.slice('Bearer '.length).trim());
        if (claims) actorUserId = claims.userId;
      }

      const meta = { userAgent: req.headers['user-agent'], ip: req.ip };
      await authService.logout(params.tenantId, actorUserId, body.refreshToken, meta);
      res.status(204).end();
    }),
  );

  // M5F-2 — troca da PROPRIA senha (exige senha atual; requireUser identifica
  // quem e). Falha de senha atual -> 401 SEM detalhar (anti-enumeracao);
  // senha nova fraca -> 422 com a regra explicita (o usuario legitimo precisa
  // saber o porque).
  router.post(
    '/change-password',
    requireUser,
    asyncHandler(async (req, res) => {
      const body = validateOrRespond(changePasswordBodySchema, req.body, res);
      if (!body) return;

      const authUser = (req as RequestWithAuthUser).authUser;
      const meta = { userAgent: req.headers['user-agent'], ip: req.ip };
      const result = await authService.changePassword(
        authUser?.userId ?? '',
        body.currentPassword,
        body.newPassword,
        meta,
      );
      if (!result.ok) {
        if (result.reason === 'weak_password') {
          res.status(422).json({
            error: 'weak_password',
            message: 'A nova senha deve ter pelo menos 8 caracteres.',
          });
          return;
        }
        res
          .status(401)
          .json({ error: 'invalid_current_password', message: 'Senha atual incorreta.' });
        return;
      }
      res.status(204).end();
    }),
  );

  router.get(
    '/me',
    requireUser,
    asyncHandler(async (req, res) => {
      const authUser = (req as RequestWithAuthUser).authUser;
      const user = authUser ? await authService.getMe(authUser.userId) : null;
      if (!user) {
        res.status(404).json({ error: 'user_not_found', message: 'Usuario nao encontrado.' });
        return;
      }
      res.status(200).json({ user });
    }),
  );

  return router;
}
