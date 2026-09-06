import type { NextApiRequest, NextApiResponse } from 'next';

import { callPlatformApi } from '../../../../lib/platformApiClient';
import { clearPlatformSessionCookie, requirePlatformSession } from '../../../../lib/platformSession';

/**
 * Centro de Tenants — lista (Fase 2, `ADMIN_PLATFORM_MASTER_PLAN.md` §6.1).
 *
 * Proxy fino: exige sessão de plataforma (relida no servidor a cada
 * requisição), repassa para `GET /api/platform/tenants` e devolve o JSON como
 * veio. Recusado pela API → cookie descartado aqui e 401, para a tela mandar
 * ao login em vez de tentar para sempre.
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
    response = await callPlatformApi<unknown>('/tenants', { session });
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
