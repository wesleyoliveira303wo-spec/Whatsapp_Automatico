import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { getApiBaseUrl, callCampaignsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * `bodyParser: false` (Fase L, Bloco L8) — o corpo do `POST` é o ARQUIVO
 * BRUTO (não JSON), mesmo motivo de `conversations/[conversationId]/media.ts`
 * (F1.3). `GET`/`DELETE` não usam corpo, então isto não os afeta.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Espelha `MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES`
 * (`apps/api/src/services/campaigns/application/CampaignService.ts`) —
 * duplicado de propósito (workspaces separados, mesmo padrão já aceito neste
 * projeto para `conversations/[conversationId]/media.ts`). Se o teto do
 * backend mudar, este valor precisa mudar junto.
 */
const MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES = 5 * 1024 * 1024;

class PayloadTooLargeError extends Error {}

/** Mesmo helper de `conversations/[conversationId]/media.ts` — lê o corpo bruto num único `Buffer`, abortando cedo se ultrapassar o teto. */
function readRawBody(req: NextApiRequest, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        req.destroy();
        reject(new PayloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function credentialHeaderFor(session: {
  accessToken?: string;
  apiKey?: string;
}): Record<string, string> {
  return session.accessToken
    ? { Authorization: `Bearer ${session.accessToken}` }
    : session.apiKey
      ? { 'X-API-Key': session.apiKey }
      : {};
}

/**
 * Proxy de mídia de campanha (Fase L, Bloco L8) — três métodos:
 *
 * `POST` — upload binário (mesmo padrão de `conversations/[conversationId]/media.ts`):
 * repassa `content-type`/`x-media-content-type`/`x-media-filename` direto
 * para a API, corpo é o arquivo cru. Devolve a `Campaign` atualizada (JSON).
 *
 * `GET` — streaming binário (mesmo padrão de
 * `conversations/[conversationId]/messages/[messageId]/media.ts`): repassa
 * `Content-Type`/`Content-Disposition` da API, corpo é o binário.
 *
 * `DELETE` — proxy JSON simples via `callCampaignsApi` (sem corpo especial).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const campaignId = requireStringParam(req.query.campaignId, 'campaignId', res);
  if (!campaignId) return;

  if (req.method === 'DELETE') {
    const { status, body } = await callCampaignsApi(
      session,
      `/${encodeURIComponent(campaignId)}/media`,
      { method: 'DELETE' },
    );
    res.status(status).json(body);
    return;
  }

  if (req.method === 'GET') {
    const baseUrl = getApiBaseUrl();
    const url = new URL(
      `/api/tenants/${encodeURIComponent(session.tenantId)}/campaigns/${encodeURIComponent(campaignId)}/media`,
      baseUrl,
    );
    const upstream = await fetch(url, { headers: credentialHeaderFor(session) });

    if (!upstream.ok) {
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
    return;
  }

  if (req.method === 'POST') {
    const contentType = req.headers['content-type'];
    const mediaContentType = req.headers['x-media-content-type'];
    if (typeof contentType !== 'string' || typeof mediaContentType !== 'string') {
      res.status(400).json({
        error: 'missing_media_headers',
        message: 'Content-Type e X-Media-Content-Type são obrigatórios.',
      });
      return;
    }

    const forwardedHeaders: Record<string, string> = {
      ...credentialHeaderFor(session),
      'content-type': contentType,
      'x-media-content-type': mediaContentType,
    };
    const fileName = req.headers['x-media-filename'];
    if (typeof fileName === 'string') forwardedHeaders['x-media-filename'] = fileName;

    let body: Buffer;
    try {
      body = await readRawBody(req, MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        res.status(413).json({
          error: 'payload_too_large',
          message: `Arquivo maior que o limite permitido (${MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES} bytes).`,
        });
        return;
      }
      throw error;
    }

    const baseUrl = getApiBaseUrl();
    const url = new URL(
      `/api/tenants/${encodeURIComponent(session.tenantId)}/campaigns/${encodeURIComponent(campaignId)}/media`,
      baseUrl,
    );
    // Ver `conversations/[conversationId]/media.ts` para o porquê de `Uint8Array`.
    const upstream = await fetch(url, {
      method: 'POST',
      headers: forwardedHeaders,
      body: new Uint8Array(body),
    });

    const text = await upstream.text();
    res.status(upstream.status).json(text ? JSON.parse(text) : {});
    return;
  }

  res.setHeader('Allow', 'POST, GET, DELETE');
  res.status(405).json({ error: 'method_not_allowed' });
}
