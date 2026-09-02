import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy (Fase 1, Bloco F1.10 — estabilidade para beta) para
 * `GET /:conversationId` (`apps/api`, `conversationsRouter`). Substitui a
 * necessidade de `useConversationDetail` varrer `GET /conversations`
 * página a página só para achar uma conversa por id — ver docstring do
 * hook e `DECISIONS.md`/`CLAUDE.md` (Bloco F1.10) para o contexto completo.
 * Isolamento de tenant/RBAC é responsabilidade de `apps/api` (validado por
 * `ConversationsService.getConversation`); este proxy só repassa.
 *
 * `DELETE` (Menu "⋮" da conversa, 2026-08-29) — exclusão DEFINITIVA, mesmo
 * proxy fino: RBAC (`conversation:delete`, ADMINISTRATOR+) é imposto pela
 * API, nunca reimplementado aqui.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const conversationId = requireStringParam(req.query.conversationId, 'conversationId', res);
  if (!conversationId) return;

  if (req.method === 'DELETE') {
    const { status } = await callConversationsApi(
      session,
      `/${encodeURIComponent(conversationId)}`,
      { method: 'DELETE' },
    );
    res.status(status).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, DELETE');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { status, body } = await callConversationsApi(
    session,
    `/${encodeURIComponent(conversationId)}`,
  );
  res.status(status).json(body);
}
