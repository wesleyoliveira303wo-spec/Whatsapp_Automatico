import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callUsersApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/** Proxy do RH (M5F-3): `POST /:userId/suspend` — suspender (soft-disable; a API revoga as sessoes do alvo). */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;
  const userId = requireStringParam(req.query.userId, 'userId', res);
  if (!userId) return;

  const { status, body } = await callUsersApi(session, `/${encodeURIComponent(userId)}/suspend`, {
    method: 'POST',
  });
  res.status(status).json(body);
}
