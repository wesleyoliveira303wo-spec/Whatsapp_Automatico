import type { NextApiRequest, NextApiResponse } from 'next';

import { callPlatformApi } from '../../../lib/platformApiClient';
import { clearPlatformSessionCookie, requirePlatformSession } from '../../../lib/platformSession';

/**
 * Busca global do `/admin` — Fase 6 (§7). Proxy fino de
 * `GET /api/platform/search?q=`. Só leitura.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requirePlatformSession(req, res);
  if (!session) return;

  const q = typeof req.query.q === 'string' ? req.query.q : '';

  let response;
  try {
    response = await callPlatformApi<unknown>(`/search?q=${encodeURIComponent(q)}`, { session });
  } catch (error) {
    res.status(502).json({ error: 'api_unreachable', message: (error as Error).message });
    return;
  }

  if (response.status === 401) {
    clearPlatformSessionCookie(res);
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }
  if (response.status !== 200) {
    res.status(502).json({ error: 'api_error', status: response.status });
    return;
  }

  res.status(200).json(response.body);
}
