import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { AiFaqEntryNotFoundError } from '../domain/errors/AiFaqEntryNotFoundError';

/**
 * Middleware de erro (Express, 4 parâmetros) para `createAiFaqRouter` —
 * Cérebro da IA v3, Fase 2. Mapeia `TenantNotFoundError` (404) e
 * `AiFaqEntryNotFoundError` (404). Erros de forma do input já são resolvidos
 * por `validateOrRespond` (400) dentro do router.
 *
 * Montado ESCOPADO ao path do próprio router, nunca globalmente (D17).
 */
export function createAiFaqErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: error.message });
      return;
    }
    if (error instanceof AiFaqEntryNotFoundError) {
      res.status(404).json({ error: 'ai_faq_entry_not_found', message: error.message });
      return;
    }
    logger.error('Erro não tratado nas rotas de FAQ da IA', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
