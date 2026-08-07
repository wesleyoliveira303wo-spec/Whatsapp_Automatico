import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../../lib/apiClient';
import { requireStringParam } from '../../../../../lib/routeParams';

/**
 * Proxy (BFF) da ATRIBUIÇÃO de uma tag a uma conversa (Redesign 2026-08-05,
 * R4): `POST /:tagId` (atribuir) e `DELETE /:tagId` (remover atribuição).
 * Mount FLAT (não aninhado por sessão, mesmo padrão de
 * `pages/api/conversations/[conversationId]/escalate.ts`) — `conversationId`
 * já é único no tenant. RBAC (`message:send`) imposto pela API.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const conversationId = requireStringParam(req.query.conversationId, 'conversationId', res);
  if (!conversationId) return;
  const tagId = requireStringParam(req.query.tagId, 'tagId', res);
  if (!tagId) return;

  const path = `/${encodeURIComponent(conversationId)}/tags/${encodeURIComponent(tagId)}`;

  if (req.method === 'POST') {
    const { status } = await callConversationsApi(session, path, { method: 'POST' });
    res.status(status).end();
    return;
  }

  if (req.method === 'DELETE') {
    const { status } = await callConversationsApi(session, path, { method: 'DELETE' });
    res.status(status).end();
    return;
  }

  res.setHeader('Allow', 'POST, DELETE');
  res.status(405).json({ error: 'method_not_allowed' });
}
