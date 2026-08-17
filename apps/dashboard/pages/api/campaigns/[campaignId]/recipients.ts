import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callCampaignsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/** Proxy dos destinatários calculados de uma campanha (Fase L, Bloco L3): `GET /:campaignId/recipients`. */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;
  const campaignId = requireStringParam(req.query.campaignId, 'campaignId', res);
  if (!campaignId) return;

  const { limit, cursor, status: statusFilter } = req.query;
  const { status, body } = await callCampaignsApi(
    session,
    `/${encodeURIComponent(campaignId)}/recipients`,
    {
      query: {
        limit: typeof limit === 'string' ? limit : undefined,
        cursor: typeof cursor === 'string' ? cursor : undefined,
        status: typeof statusFilter === 'string' ? statusFilter : undefined,
      },
    },
  );
  res.status(status).json(body);
}
