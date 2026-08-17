import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { CampaignNotFoundError } from '../domain/errors/CampaignNotFoundError';
import { NoRecipientsSelectedError } from '../domain/errors/NoRecipientsSelectedError';
import { InvalidCampaignTransitionError } from '../domain/errors/InvalidCampaignTransitionError';
import { SendingEngineNotConfiguredError } from '../domain/errors/SendingEngineNotConfiguredError';

/**
 * Middleware de erro para `createCampaignsRouter` — Fase L, Blocos L3/L4.
 * Mapeia `TenantNotFoundError`/`CampaignNotFoundError` (404),
 * `NoRecipientsSelectedError`/`InvalidCampaignTransitionError` (400) e
 * `SendingEngineNotConfiguredError` (503 — modo degradado, sem `REDIS_URL`).
 * Erros de forma do input (query/corpo inválido) já são resolvidos por
 * `validateOrRespond` dentro do router.
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
    if (error instanceof InvalidCampaignTransitionError) {
      res.status(400).json({
        error: 'invalid_campaign_transition',
        message: error.message,
        currentStatus: error.currentStatus,
      });
      return;
    }
    if (error instanceof SendingEngineNotConfiguredError) {
      res.status(503).json({ error: 'sending_engine_not_configured', message: error.message });
      return;
    }
    logger.error('Erro não tratado nas rotas de campanhas', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
