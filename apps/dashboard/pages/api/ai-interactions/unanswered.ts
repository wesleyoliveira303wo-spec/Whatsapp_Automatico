import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callAiInteractionsApi } from '../../../lib/apiClient';

/**
 * Proxy do Bloco B3 (issue #14) para `GET
 * /api/tenants/:tenantId/ai-interactions/unanswered` — as perguntas que a
 * IA marcou como "não soube responder" (Fase 1, Bloco F1.4/ADR #95).
 *
 * `sessionName` é obrigatório do lado da API; aqui ele é repassado tal como
 * recebido, sem default nenhum — inventar uma sessão neste ponto faria a
 * tela mostrar as lacunas do WhatsApp errado, e a validação já existe no
 * backend (mesmo princípio de "nunca reinterpretar decisão do backend" dos
 * demais proxies deste diretório).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const sessionName = typeof req.query.sessionName === 'string' ? req.query.sessionName : undefined;
  const limit = typeof req.query.limit === 'string' ? req.query.limit : undefined;

  const { status, body } = await callAiInteractionsApi(session, '/unanswered', {
    query: { sessionName, limit },
  });
  res.status(status).json(body);
}
