import type { NextApiRequest, NextApiResponse } from 'next';

import { forwardPlatformControl } from '../../../../../lib/platformControlProxy';

/**
 * Fase 4 — trocar o plano de um tenant. Proxy fino; a validação do plano e a
 * auditoria são da API.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  await forwardPlatformControl(
    req,
    res,
    (tenantId) => `/tenants/${encodeURIComponent(tenantId)}/plan`,
    'PATCH',
  );
}
