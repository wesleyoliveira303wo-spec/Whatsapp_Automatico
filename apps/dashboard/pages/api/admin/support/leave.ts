import type { NextApiRequest, NextApiResponse } from 'next';

import { callPlatformApi } from '../../../../lib/platformApiClient';
import { readPlatformSessionFromRequest } from '../../../../lib/platformSession';
import { clearSessionCookie, requireSession } from '../../../../lib/dashboardSession';

/**
 * Painel `/admin`, Fase 5 — "Sair do suporte". Chamada PELO PRÓPRIO produto
 * (o admin está numa sessão de suporte, `SupportAccessBanner`). Encerra o
 * acesso na API (best-effort — pode já ter acabado) e descarta a sessão de
 * suporte do cookie; o `wa_admin_session` continua e o admin volta ao
 * `/admin`.
 *
 * Guardada por `requireSession` (sessão de suporte + CSRF do produto), não
 * por `requirePlatformSession` — o token CSRF que o produto envia é o do
 * produto. O crachá de plataforma, quando existe, é lido só para chamar o
 * `end` da API.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;
  if (!session.support) {
    res.status(400).json({ error: 'not_a_support_session' });
    return;
  }

  const platformSession = readPlatformSessionFromRequest(req);
  if (platformSession) {
    try {
      await callPlatformApi(
        `/support/${encodeURIComponent(session.support.supportAccessId)}/end`,
        { method: 'POST', session: platformSession },
      );
    } catch {
      // best-effort: o acesso já pode ter sido revogado/expirado.
    }
  }

  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}
