import express, { Router } from 'express';

import { Logger } from '../../../shared/domain/Logger';
import { BillingService } from '../application/BillingService';
import { InvalidWebhookSignatureError } from '../domain/errors/billingErrors';

/**
 * Rota pública do aviso do Stripe (B5, etapa 2), montada em
 * `STRIPE_WEBHOOK_PATH`. Sem `authenticate`: quem prova a origem é a
 * assinatura do aviso, conferida sobre o corpo CRU — por isso o
 * `express.raw` aqui e o parser JSON global deixando este caminho passar.
 *
 * - assinatura inválida → 400, nada gravado;
 * - processado, repetido ou ignorado → 200;
 * - qualquer outra falha → 500, para o Stripe reenviar (ele tenta por dias,
 *   e a reconciliação por estado torna o reenvio inofensivo).
 */
export function createBillingWebhookRouter(service: BillingService, logger: Logger): Router {
  const router = Router();

  router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    const signature = req.header('stripe-signature');
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    try {
      const outcome = await service.handleWebhook(rawBody, signature);
      res.status(200).json({ received: true, outcome });
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        logger.warn('Aviso do Stripe recusado: assinatura inválida');
        res.status(400).json({ error: 'invalid_signature' });
        return;
      }
      logger.error('Falha ao processar aviso do Stripe — ele será reenviado', { error });
      res.status(500).json({ error: 'webhook_processing_failed' });
    }
  });

  return router;
}
