import { MediaDownloader } from '../domain/providers/MediaDownloader';
import { WhatsAppConnectionRegistry } from '../application/WhatsAppConnectionRegistry';

/**
 * Implementação real de `MediaDownloader` (Fase 1, Bloco F1.1, ADR #90) —
 * mesmo papel estrutural de `BullMqOutboundMessageDispatcher`: um adapter
 * fino que resolve a sessão viva no `WhatsAppConnectionRegistry` e delega ao
 * `SessionManager`/`WhatsAppProvider` concreto daquela sessão.
 *
 * `getOrCreate` (não `peek`): buscar mídia de uma conversa antiga não deveria
 * exigir que a sessão já tenha uma instância viva em memória — se o processo
 * acabou de subir e ninguém abriu essa sessão ainda, `getOrCreate` a
 * instancia sob demanda (mesmo comportamento de `getContactAvatarUrl`, que
 * também usa `getOrCreate`, não `peek` — `peek` é reservado para leitura de
 * STATUS em `listSessions()`, onde criar uma instância nova só para listar
 * seria desperdício; aqui o objetivo É obter o binário, então instanciar é
 * o comportamento correto).
 */
export class WhatsAppMediaDownloader implements MediaDownloader {
  constructor(private readonly registry: WhatsAppConnectionRegistry) {}

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
    const sessionManager = this.registry.getOrCreate(tenantId, sessionName);
    return sessionManager.downloadMedia(media);
  }
}
