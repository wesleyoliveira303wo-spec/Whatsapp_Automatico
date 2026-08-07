import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callAuditLogsApi } from '../../../lib/apiClient';

/**
 * Proxy do painel de auditoria (Fase 1, Bloco F1.5): `GET /` (listar eventos
 * do tenant, com filtros/cursor). Encaminha query/status quase sem
 * transformacao, mesmo padrao de `pages/api/users/index.ts` — RBAC
 * (`audit:read`) e imposto pela API, nunca reimplementado aqui.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    const { limit, cursor, actorUserId, action } = req.query;
    const { status: apiStatus, body } = await callAuditLogsApi(session, '', {
      query: {
        limit: typeof limit === 'string' ? limit : undefined,
        cursor: typeof cursor === 'string' ? cursor : undefined,
        actorUserId: typeof actorUserId === 'string' ? actorUserId : undefined,
        action: typeof action === 'string' ? action : undefined,
      },
    });
    res.status(apiStatus).json(body);
    return;
  }

  res.setHeader('Allow', 'GET');
  res.status(405).json({ error: 'method_not_allowed' });
}
