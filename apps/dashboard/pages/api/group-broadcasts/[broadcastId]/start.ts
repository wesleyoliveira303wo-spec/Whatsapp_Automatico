import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callGroupBroadcastsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/** Proxy de início/retomada de disparo em grupos: `POST /:broadcastId/start`. */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;
  const broadcastId = requireStringParam(req.query.broadcastId, 'broadcastId', res);
  if (!broadcastId) return;

  const { status, body } = await callGroupBroadcastsApi(
    session,
    `/${encodeURIComponent(broadcastId)}/start`,
    { method: 'POST' },
  );
  res.status(status).json(body);
}
