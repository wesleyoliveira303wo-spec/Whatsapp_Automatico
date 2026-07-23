import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/** Proxy (M2, Fase 3 — BFF-2) para `GET /:sessionName/qrcode` de `apps/api`. */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { status, body } = await callApi(session, `/${encodeURIComponent(sessionName)}/qrcode`);
  res.status(status).json(body);
}
