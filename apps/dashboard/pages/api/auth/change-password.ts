import type { NextApiRequest, NextApiResponse } from 'next';
import {
  clearSessionCookie,
  isUserSession,
  requireSession,
  setSessionCookie,
} from '../../../lib/dashboardSession';
import { getApiBaseUrl } from '../../../lib/apiClient';

/**
 * Troca da PROPRIA senha (Milestone 5, Bloco M5F-2). Fluxo em dois passos:
 *
 * 1. Repassa `{ currentPassword, newPassword }` para a API
 *    (`POST /auth/change-password`, com o cracha da sessao). A API troca o
 *    hash E revoga TODOS os refresh tokens do usuario — sessoes antigas
 *    morrem (inclusive a nossa: o refresh do cookie atual fica morto).
 * 2. RELOGA na hora com a senha nova e regrava o cookie — a pessoa continua
 *    logada AQUI, mas todo outro navegador/dispositivo cai. Se o relogin
 *    falhar (janela minima de corrida), limpa o cookie: o front leva a
 *    pessoa ao login — nunca fica uma sessao zumbi com refresh morto.
 *
 * So faz sentido para sessao de PESSOA — sessao de API key nao tem senha.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;
  if (!isUserSession(session)) {
    res
      .status(403)
      .json({ error: 'user_session_required', message: 'Troca de senha exige login de pessoa.' });
    return;
  }

  const { currentPassword, newPassword } = req.body ?? {};
  if (
    typeof currentPassword !== 'string' ||
    currentPassword === '' ||
    typeof newPassword !== 'string' ||
    newPassword === ''
  ) {
    res
      .status(400)
      .json({ error: 'invalid_params', message: 'currentPassword e newPassword são obrigatórios' });
    return;
  }

  const apiBaseUrl = getApiBaseUrl();
  let changeResponse: Response;
  try {
    changeResponse = await fetch(
      new URL(
        `/api/tenants/${encodeURIComponent(session.tenantId)}/auth/change-password`,
        apiBaseUrl,
      ),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      },
    );
  } catch (error) {
    res.status(502).json({ error: 'api_unreachable', message: (error as Error).message });
    return;
  }

  if (changeResponse.status === 401) {
    res.status(401).json({ error: 'invalid_current_password' });
    return;
  }
  if (changeResponse.status === 422) {
    res.status(422).json({ error: 'weak_password' });
    return;
  }
  if (!changeResponse.ok) {
    res.status(502).json({ error: 'api_error', status: changeResponse.status });
    return;
  }

  // Passo 2 — relogin com a senha nova para manter ESTA sessao viva.
  try {
    const reloginResponse = await fetch(
      new URL(`/api/tenants/${encodeURIComponent(session.tenantId)}/auth/login`, apiBaseUrl),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: session.user.email, password: newPassword }),
      },
    );
    if (reloginResponse.ok) {
      const body = (await reloginResponse.json()) as {
        accessToken?: unknown;
        refreshToken?: unknown;
      };
      if (typeof body.accessToken === 'string' && typeof body.refreshToken === 'string') {
        setSessionCookie(res, {
          ...session,
          accessToken: body.accessToken,
          refreshToken: body.refreshToken,
          user: { ...session.user, mustChangePassword: false },
        });
        res.status(204).end();
        return;
      }
    }
  } catch {
    // cai no clear abaixo
  }

  // Senha trocada mas relogin falhou: derruba a sessao local (a pessoa loga
  // de novo com a senha nova) — nunca deixa cookie com refresh token morto.
  clearSessionCookie(res);
  res.status(204).end();
}
