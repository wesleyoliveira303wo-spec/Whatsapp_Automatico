import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callConversationsApi } from '../../../lib/apiClient';

/**
 * Proxy (Milestone 3, Bloco 6 — D22) para `GET /` de
 * `/api/tenants/:tenantId/conversations` (Bloco 5). Encaminha
 * `?status=/&limit=/&cursor=` tal como recebidos — validacao/tetos
 * (`DEFAULT_LIST_LIMIT`/`MAX_LIST_LIMIT`) ja vivem em
 * `ConversationsService`, nunca duplicados aqui (mesmo padrao de
 * `pages/api/sessions/[sessionName]/history.ts`).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const limit = typeof req.query.limit === 'string' ? req.query.limit : undefined;
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

  const { status: httpStatus, body } = await callConversationsApi(session, '', { query: { status, limit, cursor } });
  res.status(httpStatus).json(body);
}
