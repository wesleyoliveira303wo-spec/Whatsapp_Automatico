import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callBillingApi } from '../../../lib/apiClient';

/** Abre o portal do cliente no Stripe (B5, etapa 2) — proxy de `POST /billing/portal`. */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { status, body } = await callBillingApi(session, '/portal', { method: 'POST' });
  res.status(status).json(body);
}
