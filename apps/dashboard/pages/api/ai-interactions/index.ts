import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callAiInteractionsApi } from '../../../lib/apiClient';

/**
 * Proxy (Milestone 3, Bloco 6 — D22/D28) para `GET /` de
 * `/api/tenants/:tenantId/ai-interactions` (Bloco 5, D13). Encaminha
 * `?conversationId=/&limit=` tal como recebidos — `conversationId` opcional
 * (ausente lista o tenant inteiro; presente filtra por conversa), decisao
 * ja tomada no backend (D13, ADR #57), nunca reinterpretada aqui.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const conversationId =
    typeof req.query.conversationId === 'string' ? req.query.conversationId : undefined;
  const limit = typeof req.query.limit === 'string' ? req.query.limit : undefined;

  const { status, body } = await callAiInteractionsApi(session, '', {
    query: { conversationId, limit },
  });
  res.status(status).json(body);
}
