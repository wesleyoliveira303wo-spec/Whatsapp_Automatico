import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callContactsApi } from '../../../lib/apiClient';

/**
 * Proxy da listagem de contatos (Fase L, Bloco L1b): `GET /` (paginado por
 * cursor, com busca opcional). Encaminha query quase sem transformação,
 * mesmo padrão de `pages/api/audit-logs/index.ts` — RBAC (`contact:read`)
 * é imposto pela API, nunca reimplementado aqui.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    const { limit, cursor, search, status: filterStatus } = req.query;
    const { status: apiStatus, body } = await callContactsApi(session, '', {
      query: {
        limit: typeof limit === 'string' ? limit : undefined,
        cursor: typeof cursor === 'string' ? cursor : undefined,
        search: typeof search === 'string' ? search : undefined,
        status: typeof filterStatus === 'string' ? filterStatus : undefined,
      },
    });
    res.status(apiStatus).json(body);
    return;
  }

  // Reorganização Contatos/Campanhas (2026-08-17) — criação manual.
  if (req.method === 'POST') {
    const { status: apiStatus, body } = await callContactsApi(session, '', {
      method: 'POST',
      body: req.body,
    });
    res.status(apiStatus).json(body);
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'method_not_allowed' });
}
