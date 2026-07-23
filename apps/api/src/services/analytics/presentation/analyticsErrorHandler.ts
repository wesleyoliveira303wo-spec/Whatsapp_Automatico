import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { InvalidAnalyticsRangeError } from '../domain/errors/InvalidAnalyticsRangeError';

/**
 * Middleware de erro (Express, 4 parametros) do router de Analytics
 * (Milestone 4, Bloco M4C). Mapeia por `instanceof` (nunca por texto —
 * mesmo padrao de `conversationsErrorHandler`/`aiInteractionsErrorHandler`).
 *
 * IMPORTANTE (D17 do Bloco 5): montado ESCOPADO ao path do proprio router
 * (`app.use('/api/tenants/:tenantId/analytics', ...)`), nunca globalmente —
 * ver `index.ts`. Mapeia `TenantNotFoundError` desde a primeira versao (mesma
 * disciplina ja adotada no projeto), evitando o gap de 500 generico.
 */
export function createAnalyticsErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof InvalidAnalyticsRangeError) {
      res.status(400).json({ error: 'invalid_analytics_range', message: error.message });
      return;
    }
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: error.message });
      return;
    }
    logger.error('Erro nao tratado nas rotas de analytics', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
