import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callTenantApi } from '../../../lib/apiClient';

/**
 * Aba "Empresa" de Configuracoes (Reorganizacao Perfil/Configuracoes,
 * 2026-08-27) — hoje so o nome do tenant. GET liberado a qualquer sessao
 * autenticada (pessoa ou API key); PATCH exige `tenant:manage` na API (hoje
 * so OWNER) — a API responde 403 para os demais, repassado tal e qual.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    const { status, body } = await callTenantApi(session, '');
    res.status(status).json(body);
    return;
  }

  if (req.method === 'PATCH') {
    const { name } = req.body ?? {};
    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'invalid_params', message: 'name é obrigatório' });
      return;
    }
    const { status, body } = await callTenantApi(session, '', { method: 'PATCH', body: { name } });
    res.status(status).json(body);
    return;
  }

  res.setHeader('Allow', 'GET, PATCH');
  res.status(405).json({ error: 'method_not_allowed' });
}
