import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callCampaignsApi } from '../../../lib/apiClient';

/**
 * Proxy de campanhas (Fase L, Bloco L3): `GET /` (lista, paginada por
 * cursor) e `POST /` (cria a campanha e materializa os destinatários — NUNCA
 * envia mensagem). RBAC (`campaign:read`/`campaign:manage`) imposto pela API.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    const { limit, cursor } = req.query;
    const { status: apiStatus, body } = await callCampaignsApi(session, '', {
      query: {
        limit: typeof limit === 'string' ? limit : undefined,
        cursor: typeof cursor === 'string' ? cursor : undefined,
      },
    });
    res.status(apiStatus).json(body);
    return;
  }

  if (req.method === 'POST') {
    const { status: apiStatus, body } = await callCampaignsApi(session, '', {
      method: 'POST',
      body: req.body,
    });
    res.status(apiStatus).json(body);
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'method_not_allowed' });
}
