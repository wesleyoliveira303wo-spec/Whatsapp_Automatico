import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy (ADR #94, 2026-08-01) para `POST /:conversationId/exclude-from-pipeline`
 * — marca/desmarca a conversa como fora do funil comercial (amigo/família/
 * fornecedor/funcionário no mesmo número da empresa). Mesmo padrão
 * proxy-fino de `stage.ts`/`escalate.ts`: encaminha o corpo tal como
 * recebido, RBAC/validação (`message:send`, `excluded` precisa ser boolean)
 * são impostos pela API, nunca reimplementados aqui.
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
    `/${encodeURIComponent(conversationId)}/exclude-from-pipeline`,
    {
      method: 'POST',
      body: req.body,
    },
  );
  res.status(status).json(body);
}
