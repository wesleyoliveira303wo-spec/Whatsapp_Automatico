import { Request, Router } from 'express';
import { z } from 'zod';

import { RequestWithPrincipal } from '../../../shared/presentation/authenticate';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requireHumanActor } from '../../../shared/presentation/requireHumanActor';
import { requirePermission } from '../../../shared/presentation/requirePermission';
import { BillingActor, BillingService, BillingStatus } from '../application/BillingService';
import { PAID_PLANS } from '../domain/priceCatalog';

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId nao pode ser vazio'),
});

const checkoutBodySchema = z.object({
  plan: z.enum(PAID_PLANS as unknown as [string, ...string[]]),
});

const HUMAN_ONLY = 'Assinar ou trocar de plano exige login de pessoa.';

function toActor(req: Request): BillingActor {
  const principal = (req as RequestWithPrincipal).principal;
  return {
    userId: principal?.kind === 'user' ? principal.userId : undefined,
    ip: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
  };
}

function serialize(status: BillingStatus): Record<string, unknown> {
  const subscription = status.subscription;
  return {
    plan: status.plan,
    planSource: status.planSource,
    billingEnabled: status.billingEnabled,
    trialAvailable: status.trialAvailable,
    subscription: subscription
      ? {
          plan: subscription.plan ?? null,
          status: subscription.status ?? null,
          trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          pastDueSince: subscription.pastDueSince?.toISOString() ?? null,
        }
      : null,
  };
}

/**
 * Rotas de cobrança do tenant (B5, etapa 2), montadas em
 * `/api/tenants/:tenantId/billing` atrás do `authenticate`.
 *
 * - `GET /` — situação do plano e da assinatura, para qualquer pessoa da conta.
 * - `POST /checkout` e `POST /portal` — só o dono (`billing:manage`) e só
 *   login de pessoa: nem a API key nem o suporte assistido assinam por ele.
 */
export function createBillingRouter(service: BillingService): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const status = await service.getStatus(params.tenantId);
      res.status(200).json({ billing: serialize(status) });
    }),
  );

  router.post(
    '/checkout',
    requireHumanActor(HUMAN_ONLY),
    requirePermission('billing:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(checkoutBodySchema, req.body, res);
      if (!body) return;
      const url = await service.createCheckout(
        params.tenantId,
        body.plan as (typeof PAID_PLANS)[number],
        toActor(req),
      );
      res.status(200).json({ url });
    }),
  );

  router.post(
    '/portal',
    requireHumanActor(HUMAN_ONLY),
    requirePermission('billing:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const url = await service.createPortalSession(params.tenantId);
      res.status(200).json({ url });
    }),
  );

  return router;
}
