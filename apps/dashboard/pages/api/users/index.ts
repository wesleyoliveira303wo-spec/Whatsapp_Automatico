import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callUsersApi } from '../../../lib/apiClient';

/**
 * Proxy do RH (Milestone 5, Bloco M5F-3): `GET /` (listar usuarios do tenant,
 * com filtros/cursor) e `POST /` (criar usuario com senha provisoria).
 * Encaminha corpo/status quase sem transformacao, como todos os proxies do
 * BFF — RBAC, hierarquia e human-only sao impostos pela API (M5E), nunca
 * reimplementados aqui.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    const { limit, cursor, status, role } = req.query;
    const { status: apiStatus, body } = await callUsersApi(session, '', {
      query: {
        limit: typeof limit === 'string' ? limit : undefined,
        cursor: typeof cursor === 'string' ? cursor : undefined,
        status: typeof status === 'string' ? status : undefined,
        role: typeof role === 'string' ? role : undefined,
      },
    });
    res.status(apiStatus).json(body);
    return;
  }

  if (req.method === 'POST') {
    const { status: apiStatus, body } = await callUsersApi(session, '', { method: 'POST', body: req.body });
    res.status(apiStatus).json(body);
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'method_not_allowed' });
}
