import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callApi } from '../../../lib/apiClient';

/**
 * Proxy (M2, Fase 3 — BFF-2) para `GET /` (lista) e `POST /` (conectar) de
 * `apps/api`. Encaminha o corpo/status da API praticamente sem
 * transformação — a única coisa que este BFF acrescenta é resolver
 * `tenantId`/`apiKey` a partir do cookie (nunca do cliente) antes de
 * delegar a `callApi()`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    const { status, body } = await callApi(session, '');
    res.status(status).json(body);
    return;
  }

  if (req.method === 'POST') {
    const { status, body } = await callApi(session, '', { method: 'POST', body: req.body });
    res.status(status).json(body);
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'method_not_allowed' });
}
