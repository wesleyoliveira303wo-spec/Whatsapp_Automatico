import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/** Proxy (M2, Fase 3 — BFF-2) para `GET /:sessionName/history` (M2 Fase 2) de `apps/api`. Encaminha `?limit=` tal como recebido — a validação/o teto (`MAX_HISTORY_LIMIT`) já vivem no `WhatsAppSessionService`, não duplicados aqui. */
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

  const limit = typeof req.query.limit === 'string' ? req.query.limit : undefined;
  const { status, body } = await callApi(session, `/${encodeURIComponent(sessionName)}/history`, {
    query: { limit },
  });
  res.status(status).json(body);
}
