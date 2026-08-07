import { MediaDownloader } from '../domain/providers/MediaDownloader';
import { Logger } from '../../../shared/domain/Logger';

/**
 * Implementação de `MediaDownloader` sobre HTTP interno (Fase 1, Bloco F1.2)
 * — usada exclusivamente pelo WORKER de IA (`worker.ts`), NUNCA pelo processo
 * `apps/api` (que usa `WhatsAppMediaDownloader`, direto sobre o
 * `WhatsAppConnectionRegistry`). Existe porque o worker tem uma regra
 * arquitetural deliberada (ADR #54) de nunca instanciar sockets Baileys — só
 * `apps/api` os possui. Em vez de quebrar essa fronteira, este adapter chama
 * a rota interna `POST /internal/media/download` (montada em `index.ts`,
 * atrás de `requireInternalSecret`) e devolve o binário — mesma "porta pela
 * qual outro bounded context chega a um `WhatsAppProvider`" que
 * `WhatsAppMediaDownloader` cumpre para `services/conversations`, só que
 * atravessando um processo Node inteiro em vez de uma chamada em memória.
 *
 * Nunca lança (mesma garantia do port): qualquer erro de rede, timeout, ou
 * resposta não-2xx vira `undefined` com log `warn`/`debug` — degradação
 * graciosa, a IA cai no fallback textual de `PromptBuilder.
 * describeMessageContent` quando isso acontece.
 */
export class HttpMediaDownloader implements MediaDownloader {
  constructor(
    private readonly baseUrl: string,
    private readonly internalSecret: string,
    private readonly logger?: Logger,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async download(
    tenantId: string,
    sessionName: string,
    media: {
      contentType: 'image' | 'audio' | 'video' | 'document' | 'sticker';
      mimeType: string;
      url: string;
      mediaKeyEncrypted: string;
    },
  ): Promise<Buffer | undefined> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}/internal/media/download`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': this.internalSecret },
        body: JSON.stringify({ tenantId, sessionName, ...media }),
      });

      if (!response.ok) {
        this.logger?.debug('HttpMediaDownloader: mídia indisponível (resposta não-2xx)', {
          tenantId,
          sessionName,
          status: response.status,
        });
        return undefined;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger?.warn('HttpMediaDownloader: falha ao baixar mídia via rota interna', {
        tenantId,
        sessionName,
        error,
      });
      return undefined;
    }
  }
}
