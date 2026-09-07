import type { NextApiRequest, NextApiResponse } from 'next';

import { callPlatformApi } from './platformApiClient';
import {
  clearPlatformSessionCookie,
  requirePlatformSession,
} from './platformSession';

/**
 * Proxy fino compartilhado pelas três ações de controle da Fase 4
 * (`PATCH .../plan`, `POST .../suspend`, `POST .../reactivate`).
 *
 * Repassa os status que são RESPOSTA legítima da API (404 tenant inexistente,
 * 409 no-op, 400 corpo inválido) em vez de achatar tudo em 502 — a tela
 * precisa distinguir "não deu" de "infra caiu". 401 limpa o cookie, mesmo
 * contrato das demais rotas de plataforma.
 */
export async function forwardPlatformControl(
  req: NextApiRequest,
  res: NextApiResponse,
  buildPath: (tenantId: string) => string,
  method: 'PATCH' | 'POST',
): Promise<void> {
  const session = requirePlatformSession(req, res);
  if (!session) return;

  const { tenantId } = req.query;
  if (typeof tenantId !== 'string' || tenantId.trim() === '') {
    res.status(400).json({ error: 'invalid_tenant_id' });
    return;
  }

  let response;
  try {
    response = await callPlatformApi<unknown>(buildPath(tenantId), {
      method,
      session,
      body: method === 'PATCH' ? (req.body ?? {}) : undefined,
    });
  } catch (error) {
    res.status(502).json({ error: 'api_unreachable', message: (error as Error).message });
    return;
  }

  if (response.status === 401) {
    clearPlatformSessionCookie(res);
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }
  if ([400, 404, 409].includes(response.status)) {
    res.status(response.status).json(response.body);
    return;
  }
  if (response.status !== 200) {
    res.status(502).json({ error: 'api_error', status: response.status });
    return;
  }

  res.status(200).json(response.body);
}
