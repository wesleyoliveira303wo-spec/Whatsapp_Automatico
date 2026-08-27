import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../../lib/dashboardSession';
import { callAiFaqApi } from '../../../../../lib/apiClient';
import { requireStringParam } from '../../../../../lib/routeParams';

/**
 * Proxy (BFF) da FAQ estruturada do Cérebro da IA por SESSÃO (v3, Fase 2,
 * 2026-08-25): `GET /` (listar) e `POST /` (criar). Mesmo padrão de
 * `pages/api/sessions/[sessionName]/quick-replies/index.ts` — encaminha
 * corpo/status quase sem transformação; o RBAC (ai_profile:read/update) é
 * imposto pela API, nunca reimplementado aqui.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;

  const path = `/${encodeURIComponent(sessionName)}/ai-faq`;

  if (req.method === 'GET') {
    const { status, body } = await callAiFaqApi(session, path);
    res.status(status).json(body);
    return;
  }

  if (req.method === 'POST') {
    const { status, body } = await callAiFaqApi(session, path, {
      method: 'POST',
      body: req.body,
    });
    res.status(status).json(body);
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'method_not_allowed' });
}
