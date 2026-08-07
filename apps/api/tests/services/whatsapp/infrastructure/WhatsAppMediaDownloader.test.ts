import { WhatsAppMediaDownloader } from '../../../../src/services/whatsapp/infrastructure/WhatsAppMediaDownloader';
import { WhatsAppConnectionRegistry } from '../../../../src/services/whatsapp/application/WhatsAppConnectionRegistry';

/**
 * Testa `WhatsAppMediaDownloader` (Fase 1, Bloco F1.1, ADR #90) — adapter
 * fino, mesmo padrão de teste já usado para outros adapters triviais deste
 * projeto: um mock inline do que ele consome (`WhatsAppConnectionRegistry`),
 * sem precisar de um `SessionManager`/Baileys reais.
 */
describe('WhatsAppMediaDownloader', () => {
  it('resolve a sessão via registry.getOrCreate() e delega a downloadMedia()', async () => {
    const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('bytes'));
    const sessionManager = { downloadMedia };
    const getOrCreate = jest.fn().mockReturnValue(sessionManager);
    const registry = { getOrCreate } as unknown as WhatsAppConnectionRegistry;

    const downloader = new WhatsAppMediaDownloader(registry);
    const media = {
      contentType: 'image' as const,
      mimeType: 'image/jpeg',
      url: 'https://x.enc',
      mediaKeyEncrypted: 'enc:abc',
    };

    const result = await downloader.download('tenant-1', 'default', media);

    expect(getOrCreate).toHaveBeenCalledWith('tenant-1', 'default');
    expect(downloadMedia).toHaveBeenCalledWith(media);
    expect(result).toEqual(Buffer.from('bytes'));
  });

  it('repassa undefined quando o SessionManager não consegue baixar a mídia', async () => {
    const downloadMedia = jest.fn().mockResolvedValue(undefined);
    const getOrCreate = jest.fn().mockReturnValue({ downloadMedia });
    const registry = { getOrCreate } as unknown as WhatsAppConnectionRegistry;

    const downloader = new WhatsAppMediaDownloader(registry);
    const result = await downloader.download('tenant-1', 'default', {
      contentType: 'audio',
      mimeType: 'audio/ogg',
      url: 'https://x.enc',
      mediaKeyEncrypted: 'enc:abc',
    });

    expect(result).toBeUndefined();
  });
});
