import type { NextApiRequest, NextApiResponse } from 'next';

import { requireSession } from '../../../../lib/dashboardSession';
import { callSupportAccessApi } from '../../../../lib/apiClient';

/**
 * Fase 5 — o cliente revoga um acesso assistido ativo, a qualquer instante,
 * sem passar pelo fundador (Regra inviolável 2). É também a ação do botão
 * "Encerrar" do banner fixo.
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

  const { status, body } = await callSupportAccessApi(session, `/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
  });
  res.status(status).json(body);
}
