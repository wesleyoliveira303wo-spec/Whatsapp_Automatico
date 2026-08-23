import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy (retrofit visual 2026-08-18) para `POST /:conversationId/save-contact`
 * — botão "Salvar contato" do painel de contexto. Mesmo padrão proxy-fino de
 * `exclude-from-pipeline.ts`/`stage.ts`: encaminha o corpo tal como recebido,
 * RBAC/validação (`message:send`, tamanho do nome) são impostos pela API.
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
    `/${encodeURIComponent(conversationId)}/save-contact`,
    {
      method: 'POST',
      body: req.body,
    },
  );
  res.status(status).json(body);
}
