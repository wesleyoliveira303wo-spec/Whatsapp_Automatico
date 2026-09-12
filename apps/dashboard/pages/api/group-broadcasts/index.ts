import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callGroupBroadcastsApi } from '../../../lib/apiClient';

/**
 * Proxy de disparos em grupos (2026-09-11): `GET /` (lista de uma sessão) e
 * `POST /` (cria o disparo, confere cada grupo AO VIVO e materializa os
 * alvos — NUNCA envia mensagem). RBAC (`campaign:read`/`campaign:manage`)
 * imposto pela API. Mesmo padrão de `pages/api/campaigns/index.ts`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    const { sessionName } = req.query;
    const { status: apiStatus, body } = await callGroupBroadcastsApi(session, '', {
      query: { sessionName: typeof sessionName === 'string' ? sessionName : undefined },
    });
    res.status(apiStatus).json(body);
    return;
  }

  if (req.method === 'POST') {
    const { status: apiStatus, body } = await callGroupBroadcastsApi(session, '', {
      method: 'POST',
      body: req.body,
    });
    res.status(apiStatus).json(body);
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'method_not_allowed' });
}
