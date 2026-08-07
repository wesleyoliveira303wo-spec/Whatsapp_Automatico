import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy (pipeline de CRM, Milestone 6, Bloco M6H-5) para
 * `POST /:conversationId/stage` — move a conversa para um novo estágio do
 * funil de vendas (board Kanban, arrastar card entre colunas). Mesmo padrão
 * proxy-fino de `escalate.ts`/`resume.ts`: encaminha o corpo tal como
 * recebido, RBAC/validação (`message:send`, `stage` precisa ser um dos 5
 * valores conhecidos) são impostos pela API, nunca reimplementados aqui.
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
    `/${encodeURIComponent(conversationId)}/stage`,
    {
      method: 'POST',
      body: req.body,
    },
  );
  res.status(status).json(body);
}
