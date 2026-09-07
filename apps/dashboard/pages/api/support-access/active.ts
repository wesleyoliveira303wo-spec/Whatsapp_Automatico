import type { NextApiRequest, NextApiResponse } from 'next';

import { requireSession } from '../../../lib/dashboardSession';
import { callSupportAccessApi } from '../../../lib/apiClient';

/**
 * Painel `/admin`, Fase 5 — LADO TENANT. `GET /active`: o pedido de acesso
 * assistido que está pendente ou ativo para este tenant agora (alimenta o
 * banner de consentimento no topo do produto). Tenant-scoped: o `tenantId`
 * vem da sessão, nunca de um parâmetro.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { status, body } = await callSupportAccessApi(session, '/active');
  res.status(status).json(body);
}
