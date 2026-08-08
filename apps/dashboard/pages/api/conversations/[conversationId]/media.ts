import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { getApiBaseUrl } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * `bodyParser: false` (Fase 1, Bloco F1.3) — o corpo desta rota é o ARQUIVO
 * BRUTO enviado pelo operador (não JSON), mesmo motivo pelo qual a API
 * (`conversationsRouter.ts`) usa `express.raw()` em vez de `express.json()`
 * só nesta rota. Sem isso, o parser JSON padrão do Next.js tentaria
 * interpretar o binário como JSON e falharia (ou, pior, corromperia
 * silenciosamente).
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Espelha `MAX_AGENT_MEDIA_UPLOAD_BYTES`
 * (`apps/api/src/services/conversations/application/ConversationsService.ts`)
 * — Fase 1, Bloco F1.10 (estabilidade para beta). Duplicado de propósito (o
 * Dashboard não importa código de `apps/api`, workspaces separados, mesmo
 * padrão já aceito neste projeto para outras constantes espelhadas entre
 * bounded contexts): sem isso, `bodyParser: false` deixava esta rota
 * bufferizar QUALQUER tamanho de corpo em memória, no processo do Next.js,
 * antes de o backend (que já tinha o teto certo) ter a chance de rejeitar —
 * vetor de exaustão de memória. Se o teto do backend mudar, este valor
 * precisa mudar junto.
 */
const MAX_AGENT_MEDIA_UPLOAD_BYTES = 16 * 1024 * 1024;

class PayloadTooLargeError extends Error {}

/**
 * Lê o corpo bruto da requisição Next.js num único `Buffer` — necessário com
 * `bodyParser: false`. Aborta a leitura (`req.destroy()`) assim que o
 * acumulado ultrapassa `maxBytes`, em vez de continuar bufferizando um corpo
 * arbitrariamente grande só para descartá-lo depois — o teto é aplicado
 * ENQUANTO os chunks chegam, não só no final.
 */
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
 * Proxy de UPLOAD binário (Fase 1, Bloco F1.3) — a contrapartida de envio do
 * proxy de leitura em `messages/[messageId]/media.ts` (F1.1). Mesmo motivo
 * de não usar `callConversationsApi`/`createApiClient`: aquele cliente
 * sempre serializa `body` como JSON, o que corromperia um binário.
 *
 * Repassa os headers `x-media-*`/`content-type` do browser DIRETO para a
 * API (mesmos nomes, mesmos valores) — o BFF não interpreta o conteúdo
 * desses headers, só os encaminha; toda validação real (Zod) acontece na
 * API (`sendMediaHeadersSchema`).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;
  const conversationId = requireStringParam(req.query.conversationId, 'conversationId', res);
  if (!conversationId) return;

  const contentType = req.headers['content-type'];
  const mediaContentType = req.headers['x-media-content-type'];
  if (typeof contentType !== 'string' || typeof mediaContentType !== 'string') {
    res.status(400).json({
      error: 'missing_media_headers',
      message: 'Content-Type e X-Media-Content-Type são obrigatórios.',
    });
    return;
  }

  const baseUrl = getApiBaseUrl();
  const url = new URL(
    `/api/tenants/${encodeURIComponent(session.tenantId)}/conversations/${encodeURIComponent(conversationId)}/media`,
    baseUrl,
  );

  const credentialHeader: Record<string, string> = session.accessToken
    ? { Authorization: `Bearer ${session.accessToken}` }
    : session.apiKey
      ? { 'X-API-Key': session.apiKey }
      : {};

  const forwardedHeaders: Record<string, string> = {
    ...credentialHeader,
    'content-type': contentType,
    'x-media-content-type': mediaContentType,
  };
  const caption = req.headers['x-media-caption'];
  if (typeof caption === 'string') forwardedHeaders['x-media-caption'] = caption;
  const fileName = req.headers['x-media-filename'];
  if (typeof fileName === 'string') forwardedHeaders['x-media-filename'] = fileName;

  let body: Buffer;
  try {
    body = await readRawBody(req, MAX_AGENT_MEDIA_UPLOAD_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      res.status(413).json({
        error: 'payload_too_large',
        message: `Arquivo maior que o limite permitido (${MAX_AGENT_MEDIA_UPLOAD_BYTES} bytes).`,
      });
      return;
    }
    throw error;
  }

  // `fetch` (lib.dom.ts) tipa `body` como `BodyInit`, que não inclui `Buffer`
  // (tipo do Node) diretamente — `Uint8Array` é aceito e `Buffer` já É um
  // `Uint8Array` em runtime, então isso é só uma satisfação de tipo, sem
  // cópia real de dados.
  const upstream = await fetch(url, {
    method: 'POST',
    headers: forwardedHeaders,
    body: new Uint8Array(body),
  });

  const text = await upstream.text();
  res.status(upstream.status).json(text ? JSON.parse(text) : {});
}
