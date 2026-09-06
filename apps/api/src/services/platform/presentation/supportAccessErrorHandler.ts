import { ErrorRequestHandler } from 'express';

import { Logger } from '../../../shared/domain/Logger';
import { mapSupportAccessError } from './supportAccessErrorMapper';

/**
 * Error handler ESCOPADO às rotas tenant-scoped de acesso assistido
 * (`/api/tenants/:tenantId/support-access/*`) — Fase 5. Montado logo depois do
 * router em `index.ts` (D17: nunca global). Os erros de domínio vêm de
 * `SupportAccessService`; qualquer outro cai no 500 genérico.
 */
export function createSupportAccessErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (mapSupportAccessError(error, res)) {
      return;
    }
    logger.error('Erro não tratado nas rotas de acesso assistido', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
