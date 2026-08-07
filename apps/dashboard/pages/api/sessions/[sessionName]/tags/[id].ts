import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../../lib/dashboardSession';
import { callTagsApi } from '../../../../../lib/apiClient';
import { requireStringParam } from '../../../../../lib/routeParams';

/**
 * Proxy (BFF) de UMA tag do catálogo (Redesign 2026-08-05, R4): `PUT /:id`
 * (editar) e `DELETE /:id` (remover). Mesmo padrão de
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

  const path = `/${encodeURIComponent(sessionName)}/tags/${encodeURIComponent(id)}`;

  if (req.method === 'PUT') {
    const { status, body } = await callTagsApi(session, path, { method: 'PUT', body: req.body });
    res.status(status).json(body);
    return;
  }

  if (req.method === 'DELETE') {
    const { status } = await callTagsApi(session, path, { method: 'DELETE' });
    res.status(status).end();
    return;
  }

  res.setHeader('Allow', 'PUT, DELETE');
  res.status(405).json({ error: 'method_not_allowed' });
}
