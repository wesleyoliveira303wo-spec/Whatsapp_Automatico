import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callCampaignsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/** Proxy de início/retomada de campanha (Fase L, Bloco L4): `POST /:campaignId/start`. */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;
  const campaignId = requireStringParam(req.query.campaignId, 'campaignId', res);
  if (!campaignId) return;

  const { status, body } = await callCampaignsApi(
    session,
    `/${encodeURIComponent(campaignId)}/start`,
    { method: 'POST' },
  );
  res.status(status).json(body);
}
