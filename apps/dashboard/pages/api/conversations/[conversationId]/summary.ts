import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy (Redesign 2026-08-05, R5) para `POST /:conversationId/summary` —
 * gera (ou atualiza) o resumo da conversa pela IA, sob demanda. Mesmo
 * padrão proxy-fino de `stage.ts`/`escalate.ts`: RBAC (`message:send`) e
 * qualquer erro de negócio (conversa sem mensagens, provider indisponível)
 * são impostos/mapeados pela API, nunca reimplementados aqui.
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
    `/${encodeURIComponent(conversationId)}/summary`,
    {
      method: 'POST',
    },
  );
  res.status(status).json(body);
}
