import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callBillingApi } from '../../../lib/apiClient';
import { PAID_PLANS, type PaidPlan } from '../../../lib/plans';

/**
 * Abre a página de pagamento do Stripe (B5, etapa 2) — proxy de
 * `POST /billing/checkout`. O plano é conferido aqui antes de chamar a API;
 * quem pode assinar (só o dono) quem decide é a API.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const plan = (req.body ?? {}).plan;
  if (!PAID_PLANS.includes(plan as PaidPlan)) {
    res.status(400).json({ error: 'invalid_params', message: 'Escolha um plano pago.' });
    return;
  }

  const { status, body } = await callBillingApi(session, '/checkout', {
    method: 'POST',
    body: { plan },
  });
  res.status(status).json(body);
}
