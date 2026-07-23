import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/** Proxy (M2, Fase 3 — BFF-2) para `DELETE /:sessionName/remove` (remoção definitiva, M2 Fase 1) de `apps/api`. */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { status } = await callApi(session, `/${encodeURIComponent(sessionName)}/remove`, { method: 'DELETE' });
  res.status(status).end();
}
