import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callAnalyticsApi } from '../../../lib/apiClient';

/** Proxy (Milestone 4, Bloco M4D) para `GET .../analytics/conversations` (M4C). Mesmo padrao proxy-fino de `ai-usage.ts`. */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const granularity = typeof req.query.granularity === 'string' ? req.query.granularity : undefined;

  const { status, body } = await callAnalyticsApi(session, '/conversations', { query: { from, to, granularity } });
  res.status(status).json(body);
}
