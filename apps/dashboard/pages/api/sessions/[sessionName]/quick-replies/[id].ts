import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../../lib/dashboardSession';
import { callQuickRepliesApi } from '../../../../../lib/apiClient';
import { requireStringParam } from '../../../../../lib/routeParams';

/**
 * Proxy (BFF) de UMA Resposta Rápida (Fase 1, Bloco F1.9): `PUT /:id`
 * (editar) e `DELETE /:id` (remover). Mesmo padrão de
 * `pages/api/sessions/[sessionName]/quick-replies/index.ts`. `DELETE`
 * responde com `.end()` (sem corpo) — a API devolve 204, e `res.json(undefined)`
 * geraria um corpo espúrio.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;
  const id = requireStringParam(req.query.id, 'id', res);
  if (!id) return;

  const path = `/${encodeURIComponent(sessionName)}/quick-replies/${encodeURIComponent(id)}`;

  if (req.method === 'PUT') {
    const { status, body } = await callQuickRepliesApi(session, path, {
      method: 'PUT',
      body: req.body,
    });
    res.status(status).json(body);
    return;
  }

  if (req.method === 'DELETE') {
    const { status } = await callQuickRepliesApi(session, path, { method: 'DELETE' });
    res.status(status).end();
    return;
  }

  res.setHeader('Allow', 'PUT, DELETE');
  res.status(405).json({ error: 'method_not_allowed' });
}
