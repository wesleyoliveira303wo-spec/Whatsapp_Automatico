import type { NextApiRequest, NextApiResponse } from 'next';
import { clearSessionCookie, isUserSession, readSessionFromRequest } from '../../../lib/dashboardSession';
import { getApiBaseUrl } from '../../../lib/apiClient';

/**
 * Logout do Dashboard (M2, Fase 3 — BFF-1). Idempotente: chamar sem sessão
 * ativa também responde 204 — não há estado de sessão no servidor além do
 * próprio cookie.
 *
 * M5F-1: se a sessão é de PESSOA, antes de limpar o cookie tenta REVOGAR o
 * refresh token na API (`POST /auth/logout`) — sem isso a "chave reserva"
 * continuaria válida por até 7 dias mesmo depois do logout. BEST-EFFORT de
 * propósito: se a API estiver fora do ar, o logout local acontece do mesmo
 * jeito (o usuário não pode ficar "preso logado" porque a API caiu); o token
 * remanescente morre pelo TTL.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = readSessionFromRequest(req);
  if (session && isUserSession(session)) {
    try {
      await fetch(new URL(`/api/tenants/${encodeURIComponent(session.tenantId)}/auth/logout`, getApiBaseUrl()), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    } catch {
      // Best-effort: falha de rede/API não impede o logout local.
    }
  }

  clearSessionCookie(res);
  res.status(204).end();
}
