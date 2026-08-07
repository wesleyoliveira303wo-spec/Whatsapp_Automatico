import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../../lib/dashboardSession';
import { callAnalyticsApi } from '../../../../../lib/apiClient';
import { requireStringParam } from '../../../../../lib/routeParams';

/**
 * Proxy para `GET .../sessions/:sessionName/analytics/pipeline` (Fase 1,
 * Bloco F1.6) — retrato atual do funil (sem faixa de tempo), mesmo padrão
 * proxy-fino de `session-stability.ts`, mas sem repassar `from`/`to`/
 * `granularity` (não se aplica a esta métrica).
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

  const { status, body } = await callAnalyticsApi(
    session,
    `/${encodeURIComponent(sessionName)}/analytics/pipeline`,
  );
  res.status(status).json(body);
}
