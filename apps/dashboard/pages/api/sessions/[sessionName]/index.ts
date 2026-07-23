import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy (M2, Fase 3 — BFF-2) para `GET /:sessionName` (status/detalhe, com
 * `generation`) e `DELETE /:sessionName` (desconectar — distinto de
 * `remove.ts`, mesmo contrato de `apps/api`: desconectar preserva o
 * registro).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;

  if (req.method === 'GET') {
    const { status, body } = await callApi(session, `/${encodeURIComponent(sessionName)}`);
    res.status(status).json(body);
    return;
  }

  if (req.method === 'DELETE') {
    const { status } = await callApi(session, `/${encodeURIComponent(sessionName)}`, { method: 'DELETE' });
    res.status(status).end();
    return;
  }

  res.setHeader('Allow', 'GET, DELETE');
  res.status(405).json({ error: 'method_not_allowed' });
}
