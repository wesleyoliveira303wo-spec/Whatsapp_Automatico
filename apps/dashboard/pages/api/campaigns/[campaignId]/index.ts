import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callCampaignsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy do detalhe de uma campanha: `GET /:campaignId` — campanha + resumo
 * de destinatários (Fase L, Bloco L3). `DELETE /:campaignId` — remove a
 * campanha definitivamente (retrofit visual 2026-08-18), sem corpo na
 * resposta (a API devolve 204).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const campaignId = requireStringParam(req.query.campaignId, 'campaignId', res);
  if (!campaignId) return;

  if (req.method === 'GET') {
    const { status, body } = await callCampaignsApi(session, `/${encodeURIComponent(campaignId)}`);
    res.status(status).json(body);
    return;
  }

  if (req.method === 'DELETE') {
    const { status } = await callCampaignsApi(session, `/${encodeURIComponent(campaignId)}`, {
      method: 'DELETE',
    });
    res.status(status).end();
    return;
  }

  res.setHeader('Allow', 'GET, DELETE');
  res.status(405).json({ error: 'method_not_allowed' });
}
