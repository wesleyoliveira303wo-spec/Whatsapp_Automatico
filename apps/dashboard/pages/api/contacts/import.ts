import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../lib/dashboardSession';
import { getApiBaseUrl } from '../../../lib/apiClient';

/**
 * `bodyParser: false` (Fase L, Bloco L1b) — o corpo desta rota é o TEXTO CRU
 * do arquivo `.csv` (não JSON), mesmo motivo pelo qual a API
 * (`contactsRouter.ts`) usa `express.raw()` em vez de `express.json()` só
 * nesta rota. Mesmo padrão de `pages/api/conversations/[conversationId]/media.ts`
 * (Fase 1, Bloco F1.3), simplificado: CSV é texto, não binário — sem
 * validação de `Content-Type` do arquivo em si.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Espelha `MAX_IMPORT_UPLOAD_BYTES` (`apps/api/src/services/contacts/presentation/contactsRouter.ts`)
 * — duplicado de propósito, mesmo padrão já aceito neste projeto para
 * `MAX_AGENT_MEDIA_UPLOAD_BYTES` (workspaces separados, Dashboard não
 * importa código de `apps/api`). Aplicado ENQUANTO os chunks chegam, não só
 * no final — evita bufferizar um corpo arbitrariamente grande no processo
 * do Next.js antes de a API (que já tem o teto certo) ter a chance de
 * rejeitar.
 */
const MAX_IMPORT_UPLOAD_BYTES = 5 * 1024 * 1024;

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

/**
 * Proxy de UPLOAD de CSV (Fase L, Bloco L1b) — não usa `callContactsApi`
 * (`createApiClient`), que sempre serializa `body` como JSON: aqui o corpo
 * já É o texto a encaminhar, sem transformação.
 */
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
    body = await readRawBody(req, MAX_IMPORT_UPLOAD_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      res.status(413).json({
        error: 'payload_too_large',
        message: `Arquivo maior que o limite permitido (${MAX_IMPORT_UPLOAD_BYTES} bytes).`,
      });
      return;
    }
    throw error;
  }

  const baseUrl = getApiBaseUrl();
  const url = new URL(
    `/api/tenants/${encodeURIComponent(session.tenantId)}/contacts/import`,
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
    // `fetch` (lib.dom.ts) tipa `body` como `BodyInit`, que não inclui
    // `Buffer` diretamente — `Uint8Array` é aceito e `Buffer` já É um
    // `Uint8Array` em runtime, sem cópia real de dados.
    body: new Uint8Array(body),
  });

  const text = await upstream.text();
  res.status(upstream.status).json(text ? JSON.parse(text) : {});
}
