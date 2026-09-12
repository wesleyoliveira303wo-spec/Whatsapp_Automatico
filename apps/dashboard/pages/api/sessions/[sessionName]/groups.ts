import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy de `GET /:sessionName/groups` (Disparos em grupos, 2026-09-11) —
 * grupos de WhatsApp dos quais o número desta sessão participa, para o
 * operador escolher onde publicar. `?refresh=true` pede para ignorar o
 * cache curto do servidor (respeitando o piso de atualização lá).
 *
 * Repassa 409 (`whatsapp_not_connected`) e 504 (`groups_fetch_timeout`) tal
 * como a API devolve — a tela distingue os dois casos.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { refresh } = req.query;
  const { status, body } = await callApi(session, `/${encodeURIComponent(sessionName)}/groups`, {
    query: { refresh: typeof refresh === 'string' ? refresh : undefined },
  });
  res.status(status).json(body);
}
