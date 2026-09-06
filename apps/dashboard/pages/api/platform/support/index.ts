import type { NextApiRequest, NextApiResponse } from 'next';

import { callPlatformApi } from '../../../../lib/platformApiClient';
import { clearPlatformSessionCookie, requirePlatformSession } from '../../../../lib/platformSession';

/**
 * Painel `/admin`, Fase 5 — LADO ADMIN. `GET /` lista os pedidos de acesso
 * (seção Suporte, §9.5); `POST /` pede acesso a um tenant (body
 * `{ tenantId, reason }`). Proxy fino para `/api/platform/support`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = requirePlatformSession(req, res);
  if (!session) return;

  let response;
  try {
    if (req.method === 'GET') {
      const query = new URLSearchParams();
      if (typeof req.query.limit === 'string') query.set('limit', req.query.limit);
      if (typeof req.query.cursor === 'string') query.set('cursor', req.query.cursor);
      const qs = query.toString();
      response = await callPlatformApi<unknown>(`/support${qs ? `?${qs}` : ''}`, { session });
    } else if (req.method === 'POST') {
      response = await callPlatformApi<unknown>('/support', {
        method: 'POST',
        session,
        body: req.body ?? {},
      });
    } else {
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
  } catch (error) {
    res.status(502).json({ error: 'api_unreachable', message: (error as Error).message });
    return;
  }

  if (response.status === 401) {
    clearPlatformSessionCookie(res);
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }
  res.status(response.status).json(response.body);
}
