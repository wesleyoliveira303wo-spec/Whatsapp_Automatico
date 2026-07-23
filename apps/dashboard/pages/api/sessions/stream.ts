import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { callApi } from '../../../lib/apiClient';
import { runSsePoller } from '../../../lib/sse';

/**
 * SSE (M2, Fase 3 — BFF-3) para a LISTA de sessões do tenant — poller de
 * ~2s sobre `GET /` (M2 Fase 1). Cada evento `data:` carrega
 * `{ status, body }` (o mesmo shape de `ApiResponse`), não só `body` —
 * permite ao cliente distinguir uma resposta HTTP de erro de uma lista
 * vazia legítima, sem um segundo campo/heurística.
 *
 * Não requer `sessionName`: é o stream que alimenta a TELA DE LISTA do
 * Dashboard (M2-UI-1, Fase 4) — ver `[sessionName]/stream.ts` para o
 * stream de detalhe de uma sessão específica.
 *
 * LIMITAÇÃO CONHECIDA E ACEITA: `stream` (assim como `qrcode`/`remove`/
 * `history`, um nível abaixo) é, na prática, um segmento de path
 * RESERVADO — uma sessão chamada literalmente `stream` nunca seria
 * alcançável em `/api/sessions/stream` (sempre resolve para ESTA rota, não
 * para `[sessionName]/index.ts` com `sessionName === 'stream'`), porque os
 * dois padrões têm o MESMO número de segmentos de path e o Next.js
 * prioriza o arquivo estático sobre a rota dinâmica. Mesma categoria de
 * trade-off já aceito no projeto para nomes reservados (ex.: `sessionName`
 * nunca poderia ser `qrcode`/`remove`/`history` de qualquer forma, um nível
 * abaixo) — não validado ativamente (rejeitando esses nomes no
 * `POST /api/sessions`) porque isso está fora do escopo desta Fase.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  runSsePoller(req, res, () => callApi(session, ''));
}

/**
 * `externalResolver: true`: esta rota mantém a conexão aberta por minutos
 * (até o cliente desconectar) em vez de resolver rapidamente como uma rota
 * HTTP comum — sem este flag, o Next.js loga um aviso de "API resolved
 * without sending a response" em dev, pensando que a rota travou.
 */
export const config = {
  api: {
    externalResolver: true,
  },
};
