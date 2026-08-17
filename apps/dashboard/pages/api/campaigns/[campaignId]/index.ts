import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callCampaignsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/** Proxy do detalhe de uma campanha (Fase L, Bloco L3): `GET /:campaignId` — campanha + resumo de destinatários. */
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

  const { status, body } = await callCampaignsApi(session, `/${encodeURIComponent(campaignId)}`);
  res.status(status).json(body);
}
