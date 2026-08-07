import { MediaDownloader } from '../../../../src/services/whatsapp/domain/providers/MediaDownloader';

/**
 * Fake de `MediaDownloader` (Fase 1, Bloco F1.1, ADR #90) — em memória, sem
 * `WhatsAppConnectionRegistry`/Baileys reais. Mesmo papel de
 * `FakeOutboundMessageDispatcher`: registra as chamadas para inspeção pelos
 * testes, e permite simular "mídia indisponível" (`nextResult = undefined`,
 * o default) — `ConversationsService.getMessageMedia` precisa provar que
 * trata esse caso como `MessageMediaNotFoundError`, nunca como sucesso.
 */
export class FakeMediaDownloader implements MediaDownloader {
  public readonly downloadCalls: {
    tenantId: string;
    sessionName: string;
    media: { contentType: string; mimeType: string; url: string; mediaKeyEncrypted: string };
  }[] = [];

  public nextResult: Buffer | undefined = Buffer.from('conteudo-fake');

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
    this.downloadCalls.push({ tenantId, sessionName, media });
    return this.nextResult;
  }
}
