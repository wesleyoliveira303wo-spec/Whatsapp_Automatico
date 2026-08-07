import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy (indicador de não lidas, 2026-07-25) para `POST /:conversationId/read`
 * — zera `unreadCount`. Mesmo padrão de `resume.ts`/`escalate.ts`.
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
    `/${encodeURIComponent(conversationId)}/read`,
    {
      method: 'POST',
    },
  );
  res.status(status).json(body);
}
