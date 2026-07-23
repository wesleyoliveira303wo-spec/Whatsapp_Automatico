import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callUsersApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/** Proxy do RH (M5F-3): `PATCH /:userId/role` — mudar o cargo. Hierarquia (quem pode mover quem) e da API (M5E-2). */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;
  const userId = requireStringParam(req.query.userId, 'userId', res);
  if (!userId) return;

  const { status, body } = await callUsersApi(session, `/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    body: req.body,
  });
  res.status(status).json(body);
}
