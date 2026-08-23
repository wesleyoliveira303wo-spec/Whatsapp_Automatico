import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callCampaignsApi } from '../../../lib/apiClient';

/**
 * Proxy de `GET /overview` (retrofit visual 2026-08-18) — cards do topo +
 * donut "Status das campanhas" da tela de Campanhas. RBAC (`campaign:read`)
 * imposto pela API.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const { sessionName } = req.query;
  const { status: apiStatus, body } = await callCampaignsApi(session, '/overview', {
    query: { sessionName: typeof sessionName === 'string' ? sessionName : undefined },
  });
  res.status(apiStatus).json(body);
}
