import { Router, RequestHandler } from 'express';
import { z } from 'zod';
import { AuthService } from '../application/AuthService';
import { RegistrationService } from '../application/RegistrationService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';

const registerBodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().min(1),
  password: z.string().min(1),
  companyName: z.string().trim().min(1),
});
const loginBodySchema = z.object({ email: z.string().trim().min(1), password: z.string().min(1) });

/**
 * Router de auth SEM tenantId no path (Fase Auth/Registro, 2026-08-26) —
 * `/api/auth/register` e `/api/auth/login`. Diferente de `authRouter.ts`
 * (montado em `/api/tenants/:tenantId/auth`), aqui o tenant nunca vem da URL:
 * no registro ele NASCE; no login ele e resolvido a partir do e-mail
 * (unico global). Mantido como router SEPARADO (nao um metodo a mais no
 * `authRouter` existente) porque o contrato de path e fundamentalmente
 * diferente — misturar os dois exigiria tornar `:tenantId` opcional em rotas
 * que hoje o exigem para outras finalidades (refresh/logout/change-password
 * continuam tenant-scoped, sem mudanca).
 *
 * Rate limit por IP nas duas rotas (mesmo motivo do `authRouter`: sao
 * pre-autenticacao, alvo natural de forca bruta/spam de contas).
 */
export function createGlobalAuthRouter(
  authService: AuthService,
  registrationService: RegistrationService,
  ipRateLimiter?: RequestHandler,
  identityRateLimiter?: RequestHandler,
): Router {
  const router = Router();
  const preAuthGuards: RequestHandler[] = ipRateLimiter ? [ipRateLimiter] : [];
  const loginGuards: RequestHandler[] = identityRateLimiter
    ? [...preAuthGuards, identityRateLimiter]
    : preAuthGuards;

  router.post(
    '/register',
    ...preAuthGuards,
    asyncHandler(async (req, res) => {
      const body = validateOrRespond(registerBodySchema, req.body, res);
      if (!body) return;

      const meta = { userAgent: req.headers['user-agent'], ip: req.ip };
      const result = await registrationService.register(body, meta);
      if (!result.ok) {
        if (result.reason === 'email_in_use') {
          res.status(409).json({ error: 'email_in_use', message: 'Este e-mail ja esta em uso.' });
          return;
        }
        if (result.reason === 'weak_password') {
          res.status(422).json({
            error: 'weak_password',
            message: 'A senha deve ter pelo menos 8 caracteres.',
          });
          return;
        }
        res.status(422).json({ error: 'invalid_input', message: 'Dados invalidos.' });
        return;
      }

      res.status(201).json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
        tenantId: result.tenantId,
      });
    }),
  );

  router.post(
    '/login',
    ...loginGuards,
    asyncHandler(async (req, res) => {
      const body = validateOrRespond(loginBodySchema, req.body, res);
      if (!body) return;

      const meta = { userAgent: req.headers['user-agent'], ip: req.ip };
      const result = await authService.loginByEmail(body.email, body.password, meta);
      if (!result.ok) {
        // Bloco B1 — lockout: 423 Locked (nao 401) para a UI poder dizer
        // "muitas tentativas, tente em X minutos" em vez de repetir
        // "senha invalida", que confundiria quem sabe a senha. Nao vaza
        // existencia: o lockout conta o e-mail TENTADO, exista ou nao
        // (ver `AccountLockout`). `Retry-After` em SEGUNDOS, como manda o RFC.
        if (result.reason === 'account_locked') {
          const retryAfterSeconds = Math.ceil((result.retryAfterMs ?? 0) / 1000);
          res.setHeader('Retry-After', String(retryAfterSeconds));
          res.status(423).json({
            error: 'account_locked',
            message: 'Muitas tentativas de acesso. Tente novamente em instantes.',
            retryAfterSeconds,
          });
          return;
        }
        res
          .status(401)
          .json({ error: 'invalid_credentials', message: 'E-mail ou senha invalidos.' });
        return;
      }
      res.status(200).json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
        tenantId: result.user.tenantId,
      });
    }),
  );

  return router;
}
