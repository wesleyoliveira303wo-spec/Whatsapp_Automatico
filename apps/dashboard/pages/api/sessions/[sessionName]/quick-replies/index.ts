import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../../lib/dashboardSession';
import { callQuickRepliesApi } from '../../../../../lib/apiClient';
import { requireStringParam } from '../../../../../lib/routeParams';

/**
 * Proxy (BFF) das Respostas Rápidas por SESSÃO (Fase 1, Bloco F1.9):
 * `GET /` (listar) e `POST /` (criar). Mesmo padrão de
 * `pages/api/sessions/[sessionName]/ai-profile/index.ts` — encaminha
 * corpo/status quase sem transformação; o RBAC (quick_reply:read/manage) é
 * imposto pela API, nunca reimplementado aqui.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;

  const path = `/${encodeURIComponent(sessionName)}/quick-replies`;

  if (req.method === 'GET') {
    const { status, body } = await callQuickRepliesApi(session, path);
    res.status(status).json(body);
    return;
  }

  if (req.method === 'POST') {
    const { status, body } = await callQuickRepliesApi(session, path, {
      method: 'POST',
      body: req.body,
    });
    res.status(status).json(body);
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'method_not_allowed' });
}
