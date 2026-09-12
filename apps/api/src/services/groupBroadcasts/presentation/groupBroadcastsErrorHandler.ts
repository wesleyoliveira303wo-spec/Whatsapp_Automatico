import { ErrorRequestHandler } from 'express';

import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import {
  GroupBroadcastEngineNotConfiguredError,
  GroupBroadcastMediaNotFoundError,
  GroupBroadcastMediaTooLargeError,
  GroupBroadcastMediaTypeMismatchError,
  GroupBroadcastNotFoundError,
  GroupBroadcastRequiresPaidPlanError,
  GroupDirectoryUnavailableError,
  InvalidGroupBroadcastTransitionError,
  InvalidRecurrenceError,
  NoGroupsSelectedError,
  TooManyGroupsSelectedError,
} from '../domain/errors/groupBroadcastErrors';

function isEntityTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: unknown }).type === 'entity.too.large'
  );
}

/**
 * Middleware de erro do `groupBroadcastsRouter` — montado ESCOPADO ao path do
 * router (D17), nunca globalmente. Mapeia por `instanceof`.
 */
export function createGroupBroadcastsErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: error.message });
      return;
    }
    if (error instanceof GroupBroadcastNotFoundError) {
      res.status(404).json({ error: 'group_broadcast_not_found', message: error.message });
      return;
    }
    if (error instanceof InvalidRecurrenceError) {
      res.status(400).json({ error: 'invalid_recurrence', message: error.message });
      return;
    }
    if (error instanceof GroupBroadcastMediaNotFoundError) {
      res.status(404).json({ error: 'group_broadcast_media_not_found', message: error.message });
      return;
    }
    if (error instanceof NoGroupsSelectedError) {
      res.status(400).json({ error: 'no_groups_selected', message: error.message });
      return;
    }
    if (error instanceof TooManyGroupsSelectedError) {
      res.status(400).json({
        error: 'too_many_groups_selected',
        message: error.message,
        max: error.max,
      });
      return;
    }
    if (error instanceof InvalidGroupBroadcastTransitionError) {
      res.status(400).json({
        error: 'invalid_group_broadcast_transition',
        message: error.message,
        currentStatus: error.currentStatus,
      });
      return;
    }
    if (error instanceof GroupBroadcastMediaTypeMismatchError) {
      res.status(400).json({
        error: 'group_broadcast_media_type_mismatch',
        message: error.message,
        declaredCategory: error.declaredCategory,
        detectedCategory: error.detectedCategory,
      });
      return;
    }
    if (error instanceof GroupBroadcastRequiresPaidPlanError) {
      res.status(403).json({ error: 'group_broadcast_requires_paid_plan', message: error.message });
      return;
    }
    // `group_broadcast_already_running` (409) existiu aqui até 2026-09-12 —
    // ver `groupBroadcastErrors.ts`: virou fila, nunca mais erro.
    // Sessão desconectada = 409 (o recurso existe, não está no estado
    // necessário); WhatsApp sem resposta = 504 (o "gateway" é o WhatsApp).
    if (error instanceof GroupDirectoryUnavailableError) {
      const status = error.reason === 'timeout' ? 504 : 409;
      res.status(status).json({
        error: error.reason === 'timeout' ? 'groups_fetch_timeout' : 'whatsapp_not_connected',
        message: error.message,
      });
      return;
    }
    if (error instanceof GroupBroadcastMediaTooLargeError) {
      res.status(413).json({ error: 'group_broadcast_media_too_large', message: error.message });
      return;
    }
    // Corpo acima do limite do `raw()` da rota de mídia — o body-parser do
    // Express lança antes de chegar ao serviço, com `type: 'entity.too.large'`.
    if (isEntityTooLarge(error)) {
      res.status(413).json({
        error: 'group_broadcast_media_too_large',
        message: 'Arquivo maior que o limite permitido.',
      });
      return;
    }
    if (error instanceof GroupBroadcastEngineNotConfiguredError) {
      res.status(503).json({ error: 'sending_engine_not_configured', message: error.message });
      return;
    }
    logger.error('Erro não tratado nas rotas de disparo em grupos', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
