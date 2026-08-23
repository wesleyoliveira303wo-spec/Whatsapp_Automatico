import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callContactsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy (BFF) de UM contato — Reorganização Contatos/Campanhas (2026-08-17):
 * `PATCH /:contactId` (editar nome/telefone) e `DELETE /:contactId`
 * (remover). Mesmo padrão de `quick-replies/[id].ts` — `DELETE` responde com
 * `.end()` (a API devolve 204 sem corpo).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const contactId = requireStringParam(req.query.contactId, 'contactId', res);
  if (!contactId) return;

  const path = `/${encodeURIComponent(contactId)}`;

  if (req.method === 'PATCH') {
    const { status, body } = await callContactsApi(session, path, {
      method: 'PATCH',
      body: req.body,
    });
    res.status(status).json(body);
    return;
  }

  if (req.method === 'DELETE') {
    const { status } = await callContactsApi(session, path, { method: 'DELETE' });
    res.status(status).end();
    return;
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  res.status(405).json({ error: 'method_not_allowed' });
}
