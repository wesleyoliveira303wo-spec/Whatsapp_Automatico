import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy (Menu "⋮" da conversa, 2026-08-29) para `POST /:conversationId/unread`
 * — marca manualmente como não lida. Mesmo padrão de `read.ts`.
 */
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

  const { status, body } = await callConversationsApi(
    session,
    `/${encodeURIComponent(conversationId)}/unread`,
    {
      method: 'POST',
    },
  );
  res.status(status).json(body);
}
