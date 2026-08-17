import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { CampaignNotFoundError } from '../domain/errors/CampaignNotFoundError';
import { NoRecipientsSelectedError } from '../domain/errors/NoRecipientsSelectedError';

/**
 * Middleware de erro para `createCampaignsRouter` — Fase L, Bloco L3.
 * Mapeia `TenantNotFoundError`/`CampaignNotFoundError` (404) e
 * `NoRecipientsSelectedError` (400). Erros de forma do input (query/corpo
 * inválido) já são resolvidos por `validateOrRespond` dentro do router.
 *
 * Montado ESCOPADO ao path do router (D17), nunca globalmente.
 */
export function createCampaignsErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: error.message });
      return;
    }
    if (error instanceof CampaignNotFoundError) {
      res.status(404).json({ error: 'campaign_not_found', message: error.message });
      return;
    }
    if (error instanceof NoRecipientsSelectedError) {
      res.status(400).json({ error: 'no_recipients_selected', message: error.message });
      return;
    }
    logger.error('Erro não tratado nas rotas de campanhas', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
