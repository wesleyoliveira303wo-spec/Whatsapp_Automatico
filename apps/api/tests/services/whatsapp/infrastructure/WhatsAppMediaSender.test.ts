import { WhatsAppMediaSender } from '../../../../src/services/whatsapp/infrastructure/WhatsAppMediaSender';
import { WhatsAppConnectionRegistry } from '../../../../src/services/whatsapp/application/WhatsAppConnectionRegistry';

/**
 * Testa `WhatsAppMediaSender` (Fase 1, Bloco F1.3) — adapter fino, mesmo
 * padrão de teste já usado para `WhatsAppMediaDownloader`: um mock inline do
 * que ele consome (`WhatsAppConnectionRegistry`), sem precisar de um
 * `SessionManager`/Baileys reais.
 */
describe('WhatsAppMediaSender', () => {
  const MEDIA = {
    contentType: 'image' as const,
    buffer: Buffer.from('bytes'),
    mimeType: 'image/jpeg',
    caption: 'legenda',
  };

  it('resolve a sessão via registry.getOrCreate() e delega a sendMediaMessage()', async () => {
    const sendMediaMessage = jest.fn().mockResolvedValue(undefined);
    const sessionManager = { sendMediaMessage };
    const getOrCreate = jest.fn().mockReturnValue(sessionManager);
    const registry = { getOrCreate } as unknown as WhatsAppConnectionRegistry;

    const sender = new WhatsAppMediaSender(registry);
    await sender.send('tenant-1', 'default', '5511999999999@s.whatsapp.net', MEDIA);

    expect(getOrCreate).toHaveBeenCalledWith('tenant-1', 'default');
    expect(sendMediaMessage).toHaveBeenCalledWith('5511999999999@s.whatsapp.net', MEDIA);
  });

  it('propaga um erro do SessionManager (ex.: WhatsAppNotConnectedError), não engole', async () => {
    const sendMediaMessage = jest.fn().mockRejectedValue(new Error('sessão desconectada'));
    const getOrCreate = jest.fn().mockReturnValue({ sendMediaMessage });
    const registry = { getOrCreate } as unknown as WhatsAppConnectionRegistry;

    const sender = new WhatsAppMediaSender(registry);

    await expect(
      sender.send('tenant-1', 'default', '5511999999999@s.whatsapp.net', MEDIA),
    ).rejects.toThrow('sessão desconectada');
  });
});
