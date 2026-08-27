import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../../lib/dashboardSession';
import { callAiProfileApi } from '../../../../../lib/apiClient';
import { requireStringParam } from '../../../../../lib/routeParams';

/**
 * Proxy (BFF) das Preferências do Cérebro da IA v3, Fase 3 (2026-08-26):
 * `GET /` (ler) e `PUT /` (upsert parcial). Mesmo padrão exato de
 * `.../ai-profile/index.ts` — reaproveita `callAiProfileApi` (mesmo recurso
 * `sessions`, mesmo RBAC ai_profile:read/update na API). Encaminha
 * corpo/status quase sem transformação.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;

  const path = `/${encodeURIComponent(sessionName)}/ai-preferences`;

  if (req.method === 'GET') {
    const { status, body } = await callAiProfileApi(session, path);
    res.status(status).json(body);
    return;
  }

  if (req.method === 'PUT') {
    const { status, body } = await callAiProfileApi(session, path, {
      method: 'PUT',
      body: req.body,
    });
    res.status(status).json(body);
    return;
  }

  res.setHeader('Allow', 'GET, PUT');
  res.status(405).json({ error: 'method_not_allowed' });
}
