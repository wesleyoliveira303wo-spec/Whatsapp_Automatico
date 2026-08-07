import { MediaSender } from '../../../../src/services/whatsapp/domain/providers/MediaSender';

/**
 * Fake de `MediaSender` (Fase 1, Bloco F1.3) — em memória, sem
 * `WhatsAppConnectionRegistry`/Baileys reais. Mesmo papel de
 * `FakeMediaDownloader`/`FakeOutboundMessageDispatcher`: registra as
 * chamadas para inspeção pelos testes, e permite simular falha
 * (`nextError`) — `ConversationsService.sendAgentMediaMessage` precisa
 * provar que propaga essa falha (nunca engole), mesma disciplina de
 * `FakeWhatsAppProvider.nextSendMessageError`.
 */
export class FakeMediaSender implements MediaSender {
  public readonly sendCalls: {
    tenantId: string;
    sessionName: string;
    to: string;
    media: {
      contentType: string;
      buffer: Buffer;
      mimeType: string;
      caption?: string;
      fileName?: string;
    };
  }[] = [];

  public nextError: Error | undefined;

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
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = undefined;
      throw error;
    }
    this.sendCalls.push({ tenantId, sessionName, to, media });
  }
}
