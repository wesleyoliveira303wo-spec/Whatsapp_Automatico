import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { getApiBaseUrl } from '../../../lib/apiClient';

/**
 * `bodyParser: false` — o corpo é o TEXTO CRU do `.csv` (mesmo padrão de
 * `pages/api/contacts/import.ts`). Reorganização Contatos/Campanhas
 * (2026-08-17): esta rota SÓ PARSEIA (nunca persiste nada, nem campanha nem
 * Contato) — "Seção 2 — Destinatários" da tela de criação.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

/** Espelha `MAX_RECIPIENTS_CSV_BYTES` (`apps/api`) — duplicado de propósito, mesmo padrão já aceito neste projeto. */
const MAX_RECIPIENTS_CSV_BYTES = 5 * 1024 * 1024;

class PayloadTooLargeError extends Error {}

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

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;

  let body: Buffer;
  try {
    body = await readRawBody(req, MAX_RECIPIENTS_CSV_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      res.status(413).json({
        error: 'payload_too_large',
        message: `Arquivo maior que o limite permitido (${MAX_RECIPIENTS_CSV_BYTES} bytes).`,
      });
      return;
    }
    throw error;
  }

  const baseUrl = getApiBaseUrl();
  const url = new URL(
    `/api/tenants/${encodeURIComponent(session.tenantId)}/campaigns/parse-recipients-csv`,
    baseUrl,
  );

  const credentialHeader: Record<string, string> = session.accessToken
    ? { Authorization: `Bearer ${session.accessToken}` }
    : session.apiKey
      ? { 'X-API-Key': session.apiKey }
      : {};

  const upstream = await fetch(url, {
    method: 'POST',
    headers: { ...credentialHeader, 'Content-Type': 'text/csv' },
    body: new Uint8Array(body),
  });

  const text = await upstream.text();
  res.status(upstream.status).json(text ? JSON.parse(text) : {});
}
