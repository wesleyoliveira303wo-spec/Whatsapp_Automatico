import type { NextApiRequest, NextApiResponse } from 'next';

import { callPlatformApi } from '../../../../lib/platformApiClient';
import { clearPlatformSessionCookie, requirePlatformSession } from '../../../../lib/platformSession';

/**
 * Centro de Tenants — detalhe de um tenant (Fase 2, §6.2).
 *
 * Mesmo proxy fino do `index.ts`. `404` da API (tenant inexistente) é
 * repassado como `404` — não é falha de infraestrutura, é resposta legítima.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requirePlatformSession(req, res);
  if (!session) return;

  const { tenantId } = req.query;
  if (typeof tenantId !== 'string' || tenantId.trim() === '') {
    res.status(400).json({ error: 'invalid_tenant_id' });
    return;
  }

  let response;
  try {
    response = await callPlatformApi<unknown>(
      `/tenants/${encodeURIComponent(tenantId)}`,
      { session },
    );
  } catch (error) {
    res.status(502).json({ error: 'api_unreachable', message: (error as Error).message });
    return;
  }

  if (response.status === 401) {
    clearPlatformSessionCookie(res);
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }
  if (response.status === 404) {
    res.status(404).json({ error: 'tenant_not_found' });
    return;
  }
  if (response.status !== 200) {
    res.status(502).json({ error: 'api_error', status: response.status });
    return;
  }

  res.status(200).json(response.body);
}
