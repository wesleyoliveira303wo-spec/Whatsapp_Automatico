import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { CampaignNotFoundError } from '../domain/errors/CampaignNotFoundError';
import { NoRecipientsSelectedError } from '../domain/errors/NoRecipientsSelectedError';
import { InvalidCampaignTransitionError } from '../domain/errors/InvalidCampaignTransitionError';
import { SendingEngineNotConfiguredError } from '../domain/errors/SendingEngineNotConfiguredError';
import { CampaignMediaTooLargeError } from '../domain/errors/CampaignMediaTooLargeError';
import { CampaignMediaTypeMismatchError } from '../domain/errors/CampaignMediaTypeMismatchError';
import { CampaignMediaNotFoundError } from '../domain/errors/CampaignMediaNotFoundError';

/**
 * Middleware de erro para `createCampaignsRouter` — Fase L, Blocos L3/L4.
 * Mapeia `TenantNotFoundError`/`CampaignNotFoundError` (404),
 * `NoRecipientsSelectedError`/`InvalidCampaignTransitionError` (400) e
 * `SendingEngineNotConfiguredError` (503 — modo degradado, sem `REDIS_URL`).
 * Fase L, Bloco L8: `CampaignMediaTooLargeError` (413),
 * `CampaignMediaTypeMismatchError` (400), `CampaignMediaNotFoundError` (404).
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
    // Fase L, Bloco L8 (mídia na campanha) — mesmos códigos/status de
    // `AgentMediaTooLargeError`/`AgentMediaTypeMismatchError`
    // (`conversationsErrorHandler.ts`), duplicados por bounded context.
    if (error instanceof CampaignMediaTooLargeError) {
      res.status(413).json({ error: 'campaign_media_too_large', message: error.message });
      return;
    }
    if (error instanceof CampaignMediaTypeMismatchError) {
      res.status(400).json({
        error: 'campaign_media_type_mismatch',
        message: error.message,
        declaredCategory: error.declaredCategory,
        detectedCategory: error.detectedCategory,
      });
      return;
    }
    if (error instanceof CampaignMediaNotFoundError) {
      res.status(404).json({ error: 'campaign_media_not_found', message: error.message });
      return;
    }
    logger.error('Erro não tratado nas rotas de campanhas', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
