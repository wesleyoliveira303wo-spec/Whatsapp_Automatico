import { MediaSender } from '../domain/providers/MediaSender';
import { WhatsAppConnectionRegistry } from '../application/WhatsAppConnectionRegistry';

/**
 * Implementação real de `MediaSender` (Fase 1, Bloco F1.3) — mesmo papel
 * estrutural de `WhatsAppMediaDownloader`: um adapter fino que resolve a
 * sessão viva no `WhatsAppConnectionRegistry` e delega ao
 * `SessionManager`/`WhatsAppProvider` concreto daquela sessão.
 *
 * `getOrCreate` (não `peek`) — mesmo racional de `WhatsAppMediaDownloader`:
 * enviar uma mensagem não deveria exigir que a sessão já tenha uma instância
 * viva em memória; se o processo acabou de subir, `getOrCreate` a instancia
 * sob demanda.
 */
export class WhatsAppMediaSender implements MediaSender {
  constructor(private readonly registry: WhatsAppConnectionRegistry) {}

  async send(
    tenantId: string,
    sessionName: string,
    to: string,
    media: {
      contentType: 'image' | 'audio' | 'video' | 'document';
      buffer: Buffer;
      mimeType: string;
      caption?: string;
      fileName?: string;
    },
  ): Promise<void> {
    const sessionManager = this.registry.getOrCreate(tenantId, sessionName);
    await sessionManager.sendMediaMessage(to, media);
  }
}
