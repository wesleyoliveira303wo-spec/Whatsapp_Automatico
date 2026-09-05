import type { NextApiRequest, NextApiResponse } from 'next';

import { callPlatformApi } from '../../../lib/platformApiClient';
import { clearPlatformSessionCookie, requirePlatformSession } from '../../../lib/platformSession';

/**
 * Quem está logado no `/admin` — Fase 1.
 *
 * Não devolve o que está no cookie: pergunta à API, que relê o admin do banco
 * a cada requisição. É por isso que um admin suspenso perde o painel na hora,
 * e não quando o crachá vencer. Recusado pela API, o cookie é descartado aqui
 * mesmo — a tela manda para o login em vez de tentar de novo para sempre.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requirePlatformSession(req, res);
  if (!session) return;

  let response;
  try {
    response = await callPlatformApi<{ user?: unknown }>('/auth/me', { session });
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
