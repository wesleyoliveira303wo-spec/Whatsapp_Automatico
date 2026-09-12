import { WhatsAppGroupMessageSender } from '../../../../src/services/whatsapp/infrastructure/WhatsAppGroupMessageSender';
import { WhatsAppConnectionRegistry } from '../../../../src/services/whatsapp/application/WhatsAppConnectionRegistry';
import { WhatsAppNotConnectedError } from '../../../../src/services/whatsapp/domain/errors/WhatsAppNotConnectedError';
import { FakeWhatsAppProviderFactory } from './FakeWhatsAppProviderFactory';
import { FakeWhatsAppSessionRepository, FakeWhatsAppSessionEventRepository } from '../testDoubles';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';

function buildSut(options: { sleepCalls?: number[] } = {}): {
  sender: WhatsAppGroupMessageSender;
  registry: WhatsAppConnectionRegistry;
  providerFactory: FakeWhatsAppProviderFactory;
} {
  const providerFactory = new FakeWhatsAppProviderFactory();
  const sessionRepo = new FakeWhatsAppSessionRepository();
  const eventRepo = new FakeWhatsAppSessionEventRepository();
  const logger = new NoopLogger();
  const registry = new WhatsAppConnectionRegistry(providerFactory, sessionRepo, logger, eventRepo);

  const sender = new WhatsAppGroupMessageSender(registry, logger, {
    sleepFn: (ms: number) => {
      options.sleepCalls?.push(ms);
      return Promise.resolve();
    },
  });
  return { sender, registry, providerFactory };
}

/**
 * `WhatsAppGroupMessageSender` — Disparos em grupos (2026-09-11). Diferente
 * de `WhatsAppCampaignMessageSender`, NUNCA cria `WhatsAppConversation`/
 * `WhatsAppMessage`: grupo é destino de publicação, não conversa do CRM.
 */
describe('WhatsAppGroupMessageSender', () => {
  it('publica texto puro no grupo (delega ao SessionManager.sendMessage)', async () => {
    const { sender, registry, providerFactory } = buildSut();
    registry.getOrCreate('tenant-1', 'default');

    const result = await sender.send('tenant-1', 'default', '111@g.us', 'Promoção!');

    expect(result).toEqual({ ok: true });
    const [provider] = providerFactory.getCreatedProviders();
    expect(provider.sendMessageCalls).toEqual([{ to: '111@g.us', content: 'Promoção!' }]);
    expect(provider.sendMediaMessageCalls).toEqual([]);
  });

  it('com mídia: content vira a LEGENDA — uma mensagem só, nunca duas', async () => {
    const { sender, registry, providerFactory } = buildSut();
    registry.getOrCreate('tenant-1', 'default');

    const result = await sender.send('tenant-1', 'default', '111@g.us', 'Confira!', {
      contentType: 'image',
      buffer: Buffer.from('bytes'),
      mimeType: 'image/jpeg',
      fileName: 'promo.jpg',
    });

    expect(result).toEqual({ ok: true });
    const [provider] = providerFactory.getCreatedProviders();
    expect(provider.sendMessageCalls).toEqual([]);
    expect(provider.sendMediaMessageCalls).toEqual([
      {
        to: '111@g.us',
        media: {
          contentType: 'image',
          buffer: Buffer.from('bytes'),
          mimeType: 'image/jpeg',
          fileName: 'promo.jpg',
          caption: 'Confira!',
        },
      },
    ]);
  });

  describe('retry em WhatsAppNotConnectedError (mesmo racional de WhatsAppCampaignMessageSender)', () => {
    it('recupera na retentativa: 1ª falha, 2ª tem sucesso', async () => {
      const sleepCalls: number[] = [];
      const { sender, registry, providerFactory } = buildSut({ sleepCalls });
      registry.getOrCreate('tenant-1', 'default');
      const [provider] = providerFactory.getCreatedProviders();
      provider.nextSendMessageError = new WhatsAppNotConnectedError('tenant-1', 'default');

      const result = await sender.send('tenant-1', 'default', '111@g.us', 'Oi');

      expect(result).toEqual({ ok: true });
      expect(sleepCalls).toEqual([5000]);
      expect(provider.sendMessageCalls).toEqual([{ to: '111@g.us', content: 'Oi' }]);
    });

    it('esgota as retentativas: falha em todas as tentativas devolve ok=false', async () => {
      const sleepCalls: number[] = [];
      const { sender, registry, providerFactory } = buildSut({ sleepCalls });
      registry.getOrCreate('tenant-1', 'default');
      const [provider] = providerFactory.getCreatedProviders();
      provider.sendMessage = async () => {
        throw new WhatsAppNotConnectedError('tenant-1', 'default');
      };

      const result = await sender.send('tenant-1', 'default', '111@g.us', 'Oi');

      expect(result.ok).toBe(false);
      expect(result.failureReason).toContain('tenant-1');
      expect(sleepCalls).toEqual([5000, 5000]); // DEFAULT_MAX_RETRIES=2 → 3 tentativas.
    });

    it('erro que NÃO é WhatsAppNotConnectedError nunca retenta', async () => {
      const sleepCalls: number[] = [];
      const { sender, registry, providerFactory } = buildSut({ sleepCalls });
      registry.getOrCreate('tenant-1', 'default');
      const [provider] = providerFactory.getCreatedProviders();
      let callCount = 0;
      provider.sendMessage = async () => {
        callCount += 1;
        throw new Error('número inválido');
      };

      const result = await sender.send('tenant-1', 'default', '111@g.us', 'Oi');

      expect(result).toEqual({ ok: false, failureReason: 'número inválido' });
      expect(callCount).toBe(1);
      expect(sleepCalls).toEqual([]);
    });
  });
});
