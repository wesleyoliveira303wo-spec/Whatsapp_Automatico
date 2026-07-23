import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/** Proxy (Milestone 3, Bloco 6 — D22) para `POST /:conversationId/escalate` (Bloco 5) — move a conversa para atendimento humano (`status: 'human'`). Idempotente do lado da API; devolve a `Conversation` atualizada. */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const conversationId = requireStringParam(req.query.conversationId, 'conversationId', res);
  if (!conversationId) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { status, body } = await callConversationsApi(session, `/${encodeURIComponent(conversationId)}/escalate`, {
    method: 'POST',
  });
  res.status(status).json(body);
}
