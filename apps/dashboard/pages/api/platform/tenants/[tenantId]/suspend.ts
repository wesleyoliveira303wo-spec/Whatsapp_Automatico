import type { NextApiRequest, NextApiResponse } from 'next';

import { forwardPlatformControl } from '../../../../../lib/platformControlProxy';

/** Fase 4 — suspender um tenant (bloqueia o login da conta inteira). */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  await forwardPlatformControl(
    req,
    res,
    (tenantId) => `/tenants/${encodeURIComponent(tenantId)}/suspend`,
    'POST',
  );
}
