import type { NextApiRequest, NextApiResponse } from 'next';

import { callPlatformApi } from '../../../../lib/platformApiClient';
import { requirePlatformSession } from '../../../../lib/platformSession';
import { setSessionCookie } from '../../../../lib/dashboardSession';

/**
 * Painel `/admin`, Fase 5 (5b) — "Entrar na conta". Com um acesso assistido
 * `accepted` e dentro do prazo, o admin obtém um crachá de suporte (a API
 * revalida o pedido) e o BFF grava uma **sessão de suporte** no cookie de
 * sempre (`wa_dashboard_session`) para o tenant do cliente. O admin passa a
 * usar o produto de verdade; a sessão de plataforma (`wa_admin_session`)
 * continua ativa em paralelo.
 *
 * Sem renovação: a API responde 403 quando o acesso encerra/expira, e o
 * `requireSession` limpa o cookie na requisição seguinte (Regra 3).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const platformSession = requirePlatformSession(req, res);
  if (!platformSession) return;

  const supportAccessId = (req.body as { supportAccessId?: unknown } | undefined)?.supportAccessId;
  if (typeof supportAccessId !== 'string' || supportAccessId.trim() === '') {
    res.status(400).json({ error: 'invalid_support_access_id' });
    return;
  }

  let response;
  try {
    response = await callPlatformApi<{
      token: string;
      expiresAt: string;
      tenantId: string;
      platformUserId: string;
    }>(`/support/${encodeURIComponent(supportAccessId)}/token`, {
      method: 'POST',
      session: platformSession,
    });
  } catch (error) {
    res.status(502).json({ error: 'api_unreachable', message: (error as Error).message });
    return;
  }

  if (response.status !== 200) {
    res.status(response.status).json(response.body);
    return;
  }

  const { token, tenantId, platformUserId } = response.body;
  setSessionCookie(res, {
    tenantId,
    supportToken: token,
    support: {
      supportAccessId,
      platformUserId,
      adminEmail: platformSession.user.email,
    },
  });
  res.status(200).json({ ok: true, tenantId });
}
