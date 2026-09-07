import type { NextApiRequest, NextApiResponse } from 'next';
import {
  readSessionFromRequest,
  requireSession,
  isUserSession,
  setSessionCookie,
  withSupportUser,
} from '../../../lib/dashboardSession';
import { getApiBaseUrl } from '../../../lib/apiClient';

/**
 * "Quem sou eu" do Dashboard (Milestone 5, Bloco M5F-2): devolve o que a UI
 * pode saber da sessao — `tenantId` e, para sessao de PESSOA, o `user`
 * (id/email/cargo/mustChangePassword/name/avatarUrl). NUNCA tokens nem API
 * key. Sessao de MAQUINA devolve `user: null` (a UI trata como "operador da
 * empresa", o comportamento pre-M5F). Le direto do cookie (sem bater na
 * API): e informacao de exibicao, nao de autorizacao — quem AUTORIZA e
 * sempre a API.
 *
 * PATCH (Reorganizacao Perfil/Configuracoes, 2026-08-27, aba Perfil): edita
 * o proprio nome/foto. Repassa para `PATCH /auth/me` da API (com o cracha da
 * sessao) e REGRAVA o cookie com o `user` atualizado — sem isso, a UI so
 * veria o nome novo depois de um relogin, mesma lacuna que `mustChangePassword`
 * teria se `change-password.ts` nao regravasse o cookie.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method === 'GET') {
    const session = readSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: 'not_authenticated' });
      return;
    }

    // Fase 5 — sessão de suporte: `user` sintético (owner) para o rail e os
    // gates da UI não esconderem telas do admin operando o tenant.
    const withSupport = withSupportUser(session);
    if (!isUserSession(session)) {
      res.status(200).json({ tenantId: session.tenantId, user: withSupport.user ?? null });
      return;
    }

    // A foto (`avatarUrl`) NÃO viaja no cookie — pode ser uma `data:` URI de
    // ~200 KB e estouraria o limite do navegador, derrubando a sessão (bug
    // 2026-08-28, ver `dashboardSession.toCookieSafeSession`). Para a UI ainda
    // mostrar nome/foto atualizados, busca o perfil fresco da API aqui. Se a
    // API falhar, devolve o que há no cookie (sem foto) — exibição degradada,
    // nunca erro.
    let enrichedUser = session.user;
    try {
      const meResponse = await fetch(
        new URL(`/api/tenants/${encodeURIComponent(session.tenantId)}/auth/me`, getApiBaseUrl()),
        { headers: { Authorization: `Bearer ${session.accessToken}` } },
      );
      if (meResponse.ok) {
        const body = (await meResponse.json()) as { user?: Record<string, unknown> };
        const fresh = body.user;
        if (fresh && typeof fresh.id === 'string') {
          enrichedUser = {
            ...session.user,
            name: typeof fresh.name === 'string' ? fresh.name : session.user.name,
            avatarUrl: typeof fresh.avatarUrl === 'string' ? fresh.avatarUrl : undefined,
            createdAt:
              typeof fresh.createdAt === 'string' ? fresh.createdAt : session.user.createdAt,
            lastLoginAt:
              typeof fresh.lastLoginAt === 'string'
                ? fresh.lastLoginAt
                : session.user.lastLoginAt,
          };
        }
      }
    } catch {
      // segue com o `user` do cookie
    }

    res.status(200).json({ tenantId: session.tenantId, user: enrichedUser });
    return;
  }

  if (req.method === 'PATCH') {
    const session = await requireSession(req, res);
    if (!session) return;
    if (!isUserSession(session)) {
      res
        .status(403)
        .json({ error: 'user_session_required', message: 'Edicao de perfil exige login de pessoa.' });
      return;
    }

    const { name, avatarUrl } = req.body ?? {};
    if (
      (name !== undefined && typeof name !== 'string') ||
      (avatarUrl !== undefined && typeof avatarUrl !== 'string') ||
      (name === undefined && avatarUrl === undefined)
    ) {
      res.status(400).json({ error: 'invalid_params', message: 'informe name ou avatarUrl' });
      return;
    }

    let apiBaseUrl: string;
    try {
      apiBaseUrl = getApiBaseUrl();
    } catch (error) {
      res.status(500).json({ error: 'server_misconfigured', message: (error as Error).message });
      return;
    }

    let patchResponse: Response;
    try {
      patchResponse = await fetch(
        new URL(`/api/tenants/${encodeURIComponent(session.tenantId)}/auth/me`, apiBaseUrl),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ name, avatarUrl }),
        },
      );
    } catch (error) {
      res.status(502).json({ error: 'api_unreachable', message: (error as Error).message });
      return;
    }

    if (patchResponse.status === 401) {
      res.status(401).json({ error: 'not_authenticated' });
      return;
    }
    if (!patchResponse.ok) {
      res.status(502).json({ error: 'api_error', status: patchResponse.status });
      return;
    }

    let body: { user?: Record<string, unknown> };
    try {
      body = (await patchResponse.json()) as typeof body;
    } catch {
      res.status(502).json({ error: 'api_error', message: 'resposta invalida' });
      return;
    }
    const updated = body.user;
    if (!updated || typeof updated.id !== 'string') {
      res.status(502).json({ error: 'api_error', message: 'resposta invalida' });
      return;
    }

    const updatedUser = {
      ...session.user,
      name: typeof updated.name === 'string' ? updated.name : session.user.name,
      avatarUrl: typeof updated.avatarUrl === 'string' ? updated.avatarUrl : session.user.avatarUrl,
    };
    setSessionCookie(res, { ...session, user: updatedUser });
    res.status(200).json({ tenantId: session.tenantId, user: updatedUser });
    return;
  }

  res.setHeader('Allow', 'GET, PATCH');
  res.status(405).json({ error: 'method_not_allowed' });
}
