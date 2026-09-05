import type { NextApiRequest, NextApiResponse } from 'next';

import { callPlatformApi } from '../../../lib/platformApiClient';
import { setPlatformSessionCookie } from '../../../lib/platformSession';

/**
 * Login do `/admin` — Fase 1.
 *
 * Repassa e-mail/senha para `POST /api/platform/auth/login` e guarda o crachá
 * no cookie httpOnly cifrado. O navegador NUNCA vê o crachá; recebe só o
 * admin (id, e-mail, nome).
 *
 * Um 423 (conta trancada pela trava do Bloco B1) e um 429 (rate limit) são
 * repassados com o corpo original, para a tela dizer ao fundador quanto tempo
 * falta em vez de mostrar "senha inválida" para uma senha que estava certa.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || email.trim() === '' || typeof password !== 'string' || !password) {
    res.status(400).json({ error: 'invalid_params', message: 'informe e-mail e senha' });
    return;
  }

  let response;
  try {
    response = await callPlatformApi<{ token?: unknown; user?: Record<string, unknown> }>(
      '/auth/login',
      { method: 'POST', body: { email, password } },
    );
  } catch (error) {
    res.status(502).json({ error: 'api_unreachable', message: (error as Error).message });
    return;
  }

  if (response.status === 401) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }
  if (response.status === 423 || response.status === 429) {
    res.status(response.status).json(response.body);
    return;
  }
  if (response.status !== 200) {
    res.status(502).json({ error: 'api_error', status: response.status });
    return;
  }

  const { token, user } = response.body;
  if (
    typeof token !== 'string' ||
    !user ||
    typeof user.id !== 'string' ||
    typeof user.email !== 'string' ||
    typeof user.name !== 'string'
  ) {
    res.status(502).json({ error: 'api_error', message: 'resposta de login inválida' });
    return;
  }

  const sessionUser = { id: user.id, email: user.email, name: user.name };
  setPlatformSessionCookie(res, { token, user: sessionUser });
  res.status(200).json({ user: sessionUser });
}
