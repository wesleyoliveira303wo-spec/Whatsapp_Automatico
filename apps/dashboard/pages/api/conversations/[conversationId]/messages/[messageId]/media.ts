import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../../../lib/dashboardSession';
import { getApiBaseUrl } from '../../../../../../lib/apiClient';
import { requireStringParam } from '../../../../../../lib/routeParams';

/**
 * Proxy de STREAMING BINÁRIO (Fase 1, Bloco F1.1, ADR #90) — primeiro
 * endpoint do BFF a repassar um corpo não-JSON. Deliberadamente NÃO usa
 * `callConversationsApi`/`createApiClient` (`apps/dashboard/lib/apiClient.ts`):
 * aquele cliente sempre faz `response.text()` + `JSON.parse()`, o que
 * corromperia qualquer binário (imagem/áudio/vídeo/documento) — este handler
 * monta a chamada com `fetch` cru, replicando só a parte de URL/header de
 * credencial que `createApiClient` também faz, e repassa a resposta como
 * `ArrayBuffer` sem decodificar.
 *
 * `GET` apenas — mídia é um recurso de leitura, sem contrapartida de
 * escrita (diferente de `messages.ts`, que também tem `POST`).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;
  const conversationId = requireStringParam(req.query.conversationId, 'conversationId', res);
  if (!conversationId) return;
  const messageId = requireStringParam(req.query.messageId, 'messageId', res);
  if (!messageId) return;

  const baseUrl = getApiBaseUrl();
  const url = new URL(
    `/api/tenants/${encodeURIComponent(session.tenantId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/media`,
    baseUrl,
  );

  // Mesmo racional de credencial de `createApiClient` (M5F-1): crachá de
  // pessoa (Bearer) quando há `accessToken`; chave da empresa (X-API-Key)
  // no formato original.
  const credentialHeader: Record<string, string> = session.accessToken
    ? { Authorization: `Bearer ${session.accessToken}` }
    : session.apiKey
      ? { 'X-API-Key': session.apiKey }
      : {};

  const upstream = await fetch(url, { headers: credentialHeader });

  if (!upstream.ok) {
    // A API devolve JSON de erro (`{ error, message }`) para este status —
    // repassa como JSON normal, nunca como binário.
    const text = await upstream.text();
    res.status(upstream.status).json(text ? JSON.parse(text) : { error: 'media_unavailable' });
    return;
  }

  const contentType = upstream.headers.get('content-type');
  const contentDisposition = upstream.headers.get('content-disposition');
  if (contentType) res.setHeader('Content-Type', contentType);
  if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);
  res.setHeader('Cache-Control', 'private, max-age=3600');

  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.status(200).send(buffer);
}
