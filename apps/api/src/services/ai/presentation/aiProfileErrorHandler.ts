import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';

/**
 * Middleware de erro (Express, 4 parâmetros) para `createAiProfileRouter` —
 * Base de Conhecimento (Nível 1). Mapeia só `TenantNotFoundError` por
 * enquanto: nenhum erro de Domain específico existe para este endpoint (um
 * perfil ausente é `null`, uma resposta válida — não um erro; ver
 * `AiBusinessProfileService`). Erros de forma do input (ex.: `content` maior
 * que o teto) já são resolvidos por `validateOrRespond` (400) dentro do router,
 * antes de chegar aqui.
 *
 * IMPORTANTE (D17): montado ESCOPADO ao path do próprio router, nunca
 * globalmente — ver `index.ts`.
 */
export function createAiProfileErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: error.message });
      return;
    }
    logger.error('Erro não tratado nas rotas de ai-profile', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
