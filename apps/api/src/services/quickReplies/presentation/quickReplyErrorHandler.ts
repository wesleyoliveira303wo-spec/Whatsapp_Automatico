import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { QuickReplyNotFoundError } from '../domain/errors/QuickReplyNotFoundError';

/**
 * Middleware de erro (Express, 4 parâmetros) para `createQuickReplyRouter` —
 * Fase 1, Bloco F1.9. Mapeia `TenantNotFoundError` (404) e
 * `QuickReplyNotFoundError` (404, `PUT`/`DELETE` com `id` inexistente ou de
 * outra sessão/tenant). Erros de forma do input (ex.: `content` vazio ou
 * maior que o teto) já são resolvidos por `validateOrRespond` (400) dentro
 * do router, antes de chegar aqui.
 *
 * IMPORTANTE (D17): montado ESCOPADO ao path do próprio router, nunca
 * globalmente — ver `index.ts`.
 */
export function createQuickReplyErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: error.message });
      return;
    }
    if (error instanceof QuickReplyNotFoundError) {
      res.status(404).json({ error: 'quick_reply_not_found', message: error.message });
      return;
    }
    logger.error('Erro não tratado nas rotas de quick-replies', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
