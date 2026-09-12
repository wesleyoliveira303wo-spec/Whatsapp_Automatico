import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { getApiBaseUrl, callGroupBroadcastsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * `bodyParser: false` (mesmo motivo de `campaigns/[campaignId]/media.ts`) —
 * o corpo do `POST` é o ARQUIVO BRUTO, não JSON. `GET`/`DELETE` não usam
 * corpo, então isto não os afeta.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Espelha `MAX_GROUP_MEDIA_UPLOAD_BYTES`
 * (`apps/api/src/services/groupBroadcasts/domain/policies/groupBroadcastPacing.ts`)
 * — duplicado de propósito (workspaces separados, mesmo padrão já aceito
 * para `campaigns/[campaignId]/media.ts`). Vídeo é o maior teto (16MB); se o
 * backend mudar, este valor precisa mudar junto.
 */
const MAX_GROUP_MEDIA_UPLOAD_BYTES = 16 * 1024 * 1024;

class PayloadTooLargeError extends Error {}

/** Mesmo helper de `campaigns/[campaignId]/media.ts` — lê o corpo bruto num único `Buffer`, abortando cedo se ultrapassar o teto. */
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
  supportToken?: string;
}): Record<string, string> {
  return session.supportToken
    ? { 'X-Support-Token': session.supportToken }
    : session.accessToken
      ? { Authorization: `Bearer ${session.accessToken}` }
      : session.apiKey
        ? { 'X-API-Key': session.apiKey }
        : {};
}

/**
 * Proxy de mídia de disparo em grupos (2026-09-11) — três métodos, mesmo
 * padrão de `campaigns/[campaignId]/media.ts`:
 *
 * `POST` — upload binário (corpo cru, categoria/nome em headers `x-media-*`).
 * `GET` — streaming binário (repassa Content-Type/Content-Disposition).
 * `DELETE` — proxy JSON simples via `callGroupBroadcastsApi`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const broadcastId = requireStringParam(req.query.broadcastId, 'broadcastId', res);
  if (!broadcastId) return;

  if (req.method === 'DELETE') {
    const { status, body } = await callGroupBroadcastsApi(
      session,
      `/${encodeURIComponent(broadcastId)}/media`,
      { method: 'DELETE' },
    );
    res.status(status).json(body);
    return;
  }

  if (req.method === 'GET') {
    const baseUrl = getApiBaseUrl();
    const url = new URL(
      `/api/tenants/${encodeURIComponent(session.tenantId)}/group-broadcasts/${encodeURIComponent(broadcastId)}/media`,
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
      body = await readRawBody(req, MAX_GROUP_MEDIA_UPLOAD_BYTES);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        res.status(413).json({
          error: 'payload_too_large',
          message: `Arquivo maior que o limite permitido (${MAX_GROUP_MEDIA_UPLOAD_BYTES} bytes).`,
        });
        return;
      }
      throw error;
    }

    const baseUrl = getApiBaseUrl();
    const url = new URL(
      `/api/tenants/${encodeURIComponent(session.tenantId)}/group-broadcasts/${encodeURIComponent(broadcastId)}/media`,
      baseUrl,
    );
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
