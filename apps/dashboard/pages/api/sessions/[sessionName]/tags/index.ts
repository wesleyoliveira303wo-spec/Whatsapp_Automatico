import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../../lib/dashboardSession';
import { callTagsApi } from '../../../../../lib/apiClient';
import { requireStringParam } from '../../../../../lib/routeParams';

/**
 * Proxy (BFF) do CATÁLOGO de tags por SESSÃO (Redesign 2026-08-05, R4):
 * `GET /` (listar) e `POST /` (criar). Mesmo padrão de
 * `pages/api/sessions/[sessionName]/quick-replies/index.ts` — encaminha
 * corpo/status quase sem transformação; o RBAC (tag:read/manage) é imposto
 * pela API, nunca reimplementado aqui.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;

  const path = `/${encodeURIComponent(sessionName)}/tags`;

  if (req.method === 'GET') {
    const { status, body } = await callTagsApi(session, path);
    res.status(status).json(body);
    return;
  }

  if (req.method === 'POST') {
    const { status, body } = await callTagsApi(session, path, { method: 'POST', body: req.body });
    res.status(status).json(body);
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'method_not_allowed' });
}
