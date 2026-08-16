import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callContactsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/** Proxy da reversão de opt-out (Fase L, Bloco L2): `POST /:contactId/opt-in`. */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;
  const contactId = requireStringParam(req.query.contactId, 'contactId', res);
  if (!contactId) return;

  const { status, body } = await callContactsApi(
    session,
    `/${encodeURIComponent(contactId)}/opt-in`,
    { method: 'POST' },
  );
  res.status(status).json(body);
}
