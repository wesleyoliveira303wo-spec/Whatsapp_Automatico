import { ErrorRequestHandler } from 'express';

import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import {
  BillingNotConfiguredError,
  NoBillingAccountError,
  PlanManagedManuallyError,
  SubscriptionAlreadyActiveError,
} from '../domain/errors/billingErrors';

/**
 * Erros das rotas de cobrança do tenant (B5, etapa 2), por `instanceof`. A
 * mensagem de cada erro vai direto para a aba Plano, então fala com o dono.
 */
export function createBillingErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof BillingNotConfiguredError) {
      res.status(503).json({ error: 'billing_not_configured', message: error.message });
      return;
    }
    if (error instanceof PlanManagedManuallyError) {
      res.status(409).json({ error: 'plan_managed_manually', message: error.message });
      return;
    }
    if (error instanceof SubscriptionAlreadyActiveError) {
      res.status(409).json({ error: 'subscription_already_active', message: error.message });
      return;
    }
    if (error instanceof NoBillingAccountError) {
      res.status(409).json({ error: 'no_billing_account', message: error.message });
      return;
    }
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: error.message });
      return;
    }
    logger.error('Falha numa rota de cobrança', { error });
    res.status(500).json({
      error: 'billing_failed',
      message: 'Não foi possível falar com o sistema de pagamento agora. Tente de novo.',
    });
  };
}
