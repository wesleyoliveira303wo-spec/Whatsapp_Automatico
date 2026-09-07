import type { NextApiRequest, NextApiResponse } from 'next';

import { callPlatformApi } from '../../../../../lib/platformApiClient';
import {
  clearPlatformSessionCookie,
  requirePlatformSession,
} from '../../../../../lib/platformSession';

/** Fase 5 — o admin encerra um acesso assistido ativo (sair da conta). */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requirePlatformSession(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string' || id.trim() === '') {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }

  let response;
  try {
    response = await callPlatformApi<unknown>(`/support/${encodeURIComponent(id)}/end`, {
      method: 'POST',
      session,
    });
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
