import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callAiProfileApi } from '../../../lib/apiClient';

/**
 * Proxy (BFF) da Base de Conhecimento (Nível 1 — o "Cérebro da IA"): `GET /`
 * (ler o perfil do tenant) e `PUT /` (salvar o texto). Encaminha corpo/status
 * quase sem transformação, como todos os proxies do BFF — o RBAC
 * (ai_profile:read/update) é imposto pela API, nunca reimplementado aqui.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    const { status, body } = await callAiProfileApi(session, '');
    res.status(status).json(body);
    return;
  }

  if (req.method === 'PUT') {
    const { status, body } = await callAiProfileApi(session, '', { method: 'PUT', body: req.body });
    res.status(status).json(body);
    return;
  }

  res.setHeader('Allow', 'GET, PUT');
  res.status(405).json({ error: 'method_not_allowed' });
}
