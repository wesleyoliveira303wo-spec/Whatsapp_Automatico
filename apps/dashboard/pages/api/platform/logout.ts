import type { NextApiRequest, NextApiResponse } from 'next';

import { callPlatformApi } from '../../../lib/platformApiClient';
import { clearPlatformSessionCookie, requirePlatformSession } from '../../../lib/platformSession';

/**
 * Sair do `/admin` — Fase 1.
 *
 * O cookie é apagado SEMPRE, mesmo que a API esteja fora do ar: a chamada
 * remota só registra a saída na trilha, e ninguém deve ficar preso numa
 * sessão de plataforma por causa de uma indisponibilidade.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requirePlatformSession(req, res);
  if (!session) return;

  try {
    await callPlatformApi('/auth/logout', { method: 'POST', session });
  } catch {
    // Sair nunca falha por causa da API.
  }

  clearPlatformSessionCookie(res);
  res.status(200).json({ ok: true });
}
