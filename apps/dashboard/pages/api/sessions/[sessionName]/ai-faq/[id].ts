import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../../lib/dashboardSession';
import { callAiFaqApi } from '../../../../../lib/apiClient';
import { requireStringParam } from '../../../../../lib/routeParams';

/**
 * Proxy (BFF) de UMA FAQ (v3, Fase 2): `PUT /:id` (editar/toggle active) e
 * `DELETE /:id` (remover). Mesmo padrão de
 * `pages/api/sessions/[sessionName]/quick-replies/[id].ts`. `DELETE`
 * responde com `.end()` (sem corpo) — a API devolve 204.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;
  const id = requireStringParam(req.query.id, 'id', res);
  if (!id) return;

  const path = `/${encodeURIComponent(sessionName)}/ai-faq/${encodeURIComponent(id)}`;

  if (req.method === 'PUT') {
    const { status, body } = await callAiFaqApi(session, path, {
      method: 'PUT',
      body: req.body,
    });
    res.status(status).json(body);
    return;
  }

  if (req.method === 'DELETE') {
    const { status } = await callAiFaqApi(session, path, { method: 'DELETE' });
    res.status(status).end();
    return;
  }

  res.setHeader('Allow', 'PUT, DELETE');
  res.status(405).json({ error: 'method_not_allowed' });
}
