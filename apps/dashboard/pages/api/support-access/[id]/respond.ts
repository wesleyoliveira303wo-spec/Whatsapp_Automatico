import type { NextApiRequest, NextApiResponse } from 'next';

import { requireSession } from '../../../../lib/dashboardSession';
import { callSupportAccessApi } from '../../../../lib/apiClient';

/**
 * Fase 5 — o cliente (dono/administrador) autoriza ou recusa um pedido de
 * acesso assistido. Body: `{ decision: 'accept' | 'deny' }`. RBAC
 * (`support:respond`) e a exigência de ator humano são impostos pela API.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { id } = req.query;
  if (typeof id !== 'string' || id.trim() === '') {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }

  const { status, body } = await callSupportAccessApi(session, `/${encodeURIComponent(id)}/respond`, {
    method: 'POST',
    body: req.body ?? {},
  });
  res.status(status).json(body);
}
