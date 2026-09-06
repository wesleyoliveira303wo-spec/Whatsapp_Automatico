import type { NextApiRequest, NextApiResponse } from 'next';

import { forwardPlatformControl } from '../../../../../lib/platformControlProxy';

/** Fase 4 — reativar um tenant suspenso. */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  await forwardPlatformControl(
    req,
    res,
    (tenantId) => `/tenants/${encodeURIComponent(tenantId)}/reactivate`,
    'POST',
  );
}
