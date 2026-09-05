import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callConversationsApi } from '../../../lib/apiClient';
import { runSsePoller } from '../../../lib/sse';

/**
 * SSE (Milestone 3, Bloco 6 — D23) para a LISTA de conversas do tenant —
 * poller de ~2s sobre `GET /conversations` (Bloco 5), reaproveitando
 * `runSsePoller` (M2, Fase 3) sem nenhuma alteracao. Cada frame `data:`
 * carrega `{ status, body }` (mesmo envelope das rotas SSE de sessoes).
 *
 * So a PRIMEIRA pagina e mantida viva via SSE (`?status=` congelado no
 * momento da conexao; sem `cursor`): paginas seguintes ("Carregar mais",
 * D24) sao buscadas via fetch simples em `/api/conversations` e acumuladas
 * no cliente — SSE + cursor nao combinam (cada tick reemitiria a pagina
 * inteira), trade-off registrado no levantamento arquitetural (D23).
 *
 * LIMITACAO CONHECIDA E ACEITA: `stream` e um segmento reservado sob
 * `/api/conversations/` — mesma categoria de trade-off ja aceita para
 * `stream`/`qrcode`/`remove`/`history` sob `/api/sessions/` (M2, Fase 3).
 * Aqui e inocuo na pratica: `conversationId` e um UUID gerado pelo banco,
 * nunca a string literal `stream`.
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
  // Milestone 6, Bloco M6H-2 — congelado no momento da conexão, mesmo racional de `status` (ver docstring acima).
  const sessionName = typeof req.query.sessionName === 'string' ? req.query.sessionName : undefined;
  // Reforma do escalonamento (2026-07-25) — mesmo racional, congelado no momento da conexão.
  const needsHumanAttention =
    typeof req.query.needsHumanAttention === 'string' ? req.query.needsHumanAttention : undefined;
  // Filtro "Aguardando" da inbox (2026-09-05) — repassado tal como recebido,
  // igual aos demais: quem decide o significado é a API.
  const awaitingOrInHumanCare =
    typeof req.query.awaitingOrInHumanCare === 'string'
      ? req.query.awaitingOrInHumanCare
      : undefined;
  // Menu "⋮" da conversa (2026-08-29) — mesmo racional, congelado no momento da conexão.
  const archived = typeof req.query.archived === 'string' ? req.query.archived : undefined;

  runSsePoller(req, res, () =>
    callConversationsApi(session, '', {
      query: { status, limit, sessionName, needsHumanAttention, awaitingOrInHumanCare, archived },
    }),
  );
}

/** Mesmo racional de `pages/api/sessions/stream.ts`: conexao de longa duracao, evita o aviso do Next em dev. */
export const config = {
  api: {
    externalResolver: true,
  },
};
