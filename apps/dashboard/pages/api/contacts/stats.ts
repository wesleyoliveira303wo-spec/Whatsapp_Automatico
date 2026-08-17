import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callContactsApi } from '../../../lib/apiClient';

/** Proxy das contagens da base de contatos (retrofit 2026-08-16): `GET /stats`. */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const { status, body } = await callContactsApi(session, '/stats');
  res.status(status).json(body);
}
