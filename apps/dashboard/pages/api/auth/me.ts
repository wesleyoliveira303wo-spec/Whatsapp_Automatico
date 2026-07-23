import type { NextApiRequest, NextApiResponse } from 'next';
import { readSessionFromRequest } from '../../../lib/dashboardSession';

/**
 * "Quem sou eu" do Dashboard (Milestone 5, Bloco M5F-2): devolve o que a UI
 * pode saber da sessao — `tenantId` e, para sessao de PESSOA, o `user`
 * (id/email/cargo/mustChangePassword). NUNCA tokens nem API key. Sessao de
 * MAQUINA devolve `user: null` (a UI trata como "operador da empresa", o
 * comportamento pre-M5F). Le direto do cookie (sem bater na API): e
 * informacao de exibicao, nao de autorizacao — quem AUTORIZA e sempre a API.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = readSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }

  res.status(200).json({ tenantId: session.tenantId, user: session.user ?? null });
}
