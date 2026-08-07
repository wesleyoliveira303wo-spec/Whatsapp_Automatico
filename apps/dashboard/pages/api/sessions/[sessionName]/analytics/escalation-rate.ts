import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../../lib/dashboardSession';
import { callAnalyticsApi } from '../../../../../lib/apiClient';
import { requireStringParam } from '../../../../../lib/routeParams';

/**
 * Proxy para `GET .../sessions/:sessionName/analytics/escalation-rate`
 * (Fase 1, Bloco F1.6) — série temporal por dia, mesmo padrão proxy-fino de
 * `session-stability.ts`.
 */
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

  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const granularity = typeof req.query.granularity === 'string' ? req.query.granularity : undefined;

  const { status, body } = await callAnalyticsApi(
    session,
    `/${encodeURIComponent(sessionName)}/analytics/escalation-rate`,
    {
      query: { from, to, granularity },
    },
  );
  res.status(status).json(body);
}
