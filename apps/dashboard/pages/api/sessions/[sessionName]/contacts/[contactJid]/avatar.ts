import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../../../lib/dashboardSession';
import { callApi } from '../../../../../../lib/apiClient';
import { requireStringParam } from '../../../../../../lib/routeParams';

/**
 * Proxy (Milestone 6, Bloco M6H-2b) para `GET /:sessionName/contacts/:contactJid/avatar`
 * de `apps/api` — mesmo padrão de `qrcode.ts`. `contactJid` chega já
 * URL-encoded pelo Next.js (segmento dinâmico `[contactJid]`); repassado como
 * veio para a API, que faz o próprio `decodeURIComponent` via Express.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;
  const contactJid = requireStringParam(req.query.contactJid, 'contactJid', res);
  if (!contactJid) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { status, body } = await callApi(
    session,
    `/${encodeURIComponent(sessionName)}/contacts/${encodeURIComponent(contactJid)}/avatar`,
  );
  res.status(status).json(body);
}
