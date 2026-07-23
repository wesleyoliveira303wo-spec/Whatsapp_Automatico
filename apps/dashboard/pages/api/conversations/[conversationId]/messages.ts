import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy (Milestone 3, Bloco 6 — D22/D23) para as mensagens de uma conversa:
 * - `GET /:conversationId/messages` — histórico (leitura).
 * - `POST /:conversationId/messages` — envia uma mensagem do OPERADOR (feature
 *   N2). A API responde 202 (enfileirado); a mensagem aparece na timeline via
 *   o tempo real (N2-4). RBAC/estado (message:send, conversa em "human",
 *   ownership) são impostos pela API — nunca reimplementados aqui.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const conversationId = requireStringParam(req.query.conversationId, 'conversationId', res);
  if (!conversationId) return;

  if (req.method === 'GET') {
    const limit = typeof req.query.limit === 'string' ? req.query.limit : undefined;
    const { status, body } = await callConversationsApi(session, `/${encodeURIComponent(conversationId)}/messages`, {
      query: { limit },
    });
    res.status(status).json(body);
    return;
  }

  if (req.method === 'POST') {
    const { status, body } = await callConversationsApi(session, `/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      body: req.body,
    });
    res.status(status).json(body);
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'method_not_allowed' });
}
