import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../../lib/dashboardSession';
import { callAiProfileApi } from '../../../../../lib/apiClient';
import { requireStringParam } from '../../../../../lib/routeParams';

/**
 * Proxy (BFF) da Base de Conhecimento (Nível 1 — o "Cérebro da IA") por
 * SESSÃO: `GET /` (ler o perfil) e `PUT /` (salvar o texto). Migrada da rota
 * flat `pages/api/ai-profile/*` para aninhada por sessão — Milestone 6,
 * Bloco M6H-3, 2026-07-25 — mesmo padrão de `.../contacts/:contactJid/avatar`.
 * Encaminha corpo/status quase sem transformação, como todos os proxies do
 * BFF — o RBAC (ai_profile:read/update) é imposto pela API, nunca
 * reimplementado aqui.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;

  const path = `/${encodeURIComponent(sessionName)}/ai-profile`;

  if (req.method === 'GET') {
    const { status, body } = await callAiProfileApi(session, path);
    res.status(status).json(body);
    return;
  }

  if (req.method === 'PUT') {
    const { status, body } = await callAiProfileApi(session, path, {
      method: 'PUT',
      body: req.body,
    });
    res.status(status).json(body);
    return;
  }

  res.setHeader('Allow', 'GET, PUT');
  res.status(405).json({ error: 'method_not_allowed' });
}
