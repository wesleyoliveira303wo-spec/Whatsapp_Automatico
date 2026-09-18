import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callBillingApi } from '../../../lib/apiClient';

/** Situação do plano e da assinatura (B5, etapa 2) — proxy de `GET /billing`. */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { status, body } = await callBillingApi(session, '');
  res.status(status).json(body);
}
