import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callGroupBroadcastsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy do detalhe de um disparo em grupos (2026-09-11): `GET /:broadcastId`
 * (disparo + resumo + alvos) e `DELETE /:broadcastId` (exclui — a API
 * recusa `running`, precisa pausar/cancelar antes). Mesmo padrão de
 * `pages/api/campaigns/[campaignId]/index.ts`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const broadcastId = requireStringParam(req.query.broadcastId, 'broadcastId', res);
  if (!broadcastId) return;

  if (req.method === 'GET') {
    const { status, body } = await callGroupBroadcastsApi(
      session,
      `/${encodeURIComponent(broadcastId)}`,
    );
    res.status(status).json(body);
    return;
  }

  if (req.method === 'DELETE') {
    const { status } = await callGroupBroadcastsApi(
      session,
      `/${encodeURIComponent(broadcastId)}`,
      { method: 'DELETE' },
    );
    res.status(status).end();
    return;
  }

  res.setHeader('Allow', 'GET, DELETE');
  res.status(405).json({ error: 'method_not_allowed' });
}
