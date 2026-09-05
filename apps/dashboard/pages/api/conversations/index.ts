import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callConversationsApi } from '../../../lib/apiClient';

/**
 * Proxy (Milestone 3, Bloco 6 — D22) para `GET /` de
 * `/api/tenants/:tenantId/conversations` (Bloco 5). Encaminha
 * `?status=/&limit=/&cursor=` tal como recebidos — validacao/tetos
 * (`DEFAULT_LIST_LIMIT`/`MAX_LIST_LIMIT`) ja vivem em
 * `ConversationsService`, nunca duplicados aqui (mesmo padrao de
 * `pages/api/sessions/[sessionName]/history.ts`).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const limit = typeof req.query.limit === 'string' ? req.query.limit : undefined;
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  // Milestone 6, Bloco M6H-2 — repassa `sessionName` tal como recebido, mesmo padrão dos demais.
  const sessionName = typeof req.query.sessionName === 'string' ? req.query.sessionName : undefined;
  // Reforma do escalonamento (2026-07-25) — repassa `needsHumanAttention` tal como recebido.
  const needsHumanAttention =
    typeof req.query.needsHumanAttention === 'string' ? req.query.needsHumanAttention : undefined;
  // Filtro "Aguardando" da inbox (2026-09-05) — repassado tal como recebido,
  // igual aos demais: quem decide o significado é a API.
  const awaitingOrInHumanCare =
    typeof req.query.awaitingOrInHumanCare === 'string'
      ? req.query.awaitingOrInHumanCare
      : undefined;
  // ADR #94 (2026-08-01) — repassa `excludedFromPipeline` tal como recebido.
  const excludedFromPipeline =
    typeof req.query.excludedFromPipeline === 'string' ? req.query.excludedFromPipeline : undefined;

  const { status: httpStatus, body } = await callConversationsApi(session, '', {
    query: { status, limit, cursor, sessionName, needsHumanAttention, awaitingOrInHumanCare, excludedFromPipeline },
  });
  res.status(httpStatus).json(body);
}
