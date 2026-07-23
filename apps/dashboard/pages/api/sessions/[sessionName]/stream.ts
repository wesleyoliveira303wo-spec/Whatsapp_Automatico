import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';
import { runSsePoller } from '../../../../lib/sse';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * SSE (M2, Fase 3 — BFF-3) para o DETALHE de uma sessão — poller de ~2s
 * sobre `GET /:sessionName` (status + `generation`, M2 Fase 1). Alimenta a
 * tela de detalhe/QR Code do Dashboard (M2-UI-2, Fase 4): enquanto a sessão
 * está `connecting`, o QR Code muda periodicamente — pollar o detalhe é
 * suficiente para a UI saber QUANDO buscar um QR Code novo (via
 * `qrcode.ts`), sem precisar de um segundo stream dedicado só ao QR.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  runSsePoller(req, res, () => callApi(session, `/${encodeURIComponent(sessionName)}`));
}

/** Ver mesma nota em `sessions/stream.ts`. */
export const config = {
  api: {
    externalResolver: true,
  },
};
