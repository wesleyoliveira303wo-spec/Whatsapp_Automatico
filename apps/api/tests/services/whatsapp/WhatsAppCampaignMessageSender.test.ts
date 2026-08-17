import { WhatsAppCampaignMessageSender } from '../../../src/services/whatsapp/infrastructure/WhatsAppCampaignMessageSender';
import { WhatsAppConnectionRegistry } from '../../../src/services/whatsapp/application/WhatsAppConnectionRegistry';
import { WhatsAppNotConnectedError } from '../../../src/services/whatsapp/domain/errors/WhatsAppNotConnectedError';
import { Conversation } from '../../../src/services/conversations/domain/entities/Conversation';
import { FakeWhatsAppProviderFactory } from './infrastructure/FakeWhatsAppProviderFactory';
import { FakeWhatsAppSessionRepository, FakeWhatsAppSessionEventRepository } from './testDoubles';
import { FakeConversationRepository, FakeMessageRepository } from '../conversations/testDoubles';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';

function buildSut(): {
  sender: WhatsAppCampaignMessageSender;
  registry: WhatsAppConnectionRegistry;
  providerFactory: FakeWhatsAppProviderFactory;
  conversationRepository: FakeConversationRepository;
  messageRepository: FakeMessageRepository;
} {
  const providerFactory = new FakeWhatsAppProviderFactory();
  const sessionRepo = new FakeWhatsAppSessionRepository();
  const eventRepo = new FakeWhatsAppSessionEventRepository();
  const logger = new NoopLogger();
  const registry = new WhatsAppConnectionRegistry(providerFactory, sessionRepo, logger, eventRepo);
  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();

  const sender = new WhatsAppCampaignMessageSender(
    registry,
    conversationRepository,
    messageRepository,
    logger,
  );

  return { sender, registry, providerFactory, conversationRepository, messageRepository };
}

function buildConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-1',
    tenantId: 'tenant-1',
    sessionName: 'default',
    contactJid: '5511999999999@s.whatsapp.net',
    contactId: 'contact-1',
    status: 'bot',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: new Date('2026-07-10T12:00:00Z'),
    excludedFromPipeline: false,
    tags: [],
    createdAt: new Date('2026-07-10T12:00:00Z'),
    updatedAt: new Date('2026-07-10T12:00:00Z'),
    ...overrides,
  };
}

describe('WhatsAppCampaignMessageSender (Fase L, Bloco L4)', () => {
  it('envia usando o contactJid da conversa JÁ EXISTENTE, nunca reconstruído de um telefone', async () => {
    const { sender, providerFactory, conversationRepository, messageRepository } = buildSut();
    conversationRepository.seed(buildConversation());

    const result = await sender.send('tenant-1', 'default', 'contact-1', 'Olá!');

    expect(result).toEqual({ ok: true, conversationId: 'conversation-1' });
    const [provider] = providerFactory.getCreatedProviders();
    expect(provider.sendMessageCalls).toEqual([
      { to: '5511999999999@s.whatsapp.net', content: 'Olá!' },
    ]);
    const messages = await messageRepository.listRecentByConversation(
      'tenant-1',
      'conversation-1',
      10,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      direction: 'outbound',
      content: 'Olá!',
      contentType: 'text',
    });
  });

  it('sem conversa prévia nesta sessão: devolve ok=false, NUNCA tenta enviar (reengajamento, não lista fria)', async () => {
    const { sender, providerFactory } = buildSut();
    // nenhuma conversa "seedada" para contact-1

    const result = await sender.send('tenant-1', 'default', 'contact-1', 'Olá!');

    expect(result).toEqual({ ok: false, failureReason: 'sem_conversa_existente_nesta_sessao' });
    expect(providerFactory.getCreatedProviders()).toHaveLength(0);
  });

  it('conversa existe em OUTRA sessão: ainda assim recusa (a busca é por sessão específica)', async () => {
    const { sender, conversationRepository } = buildSut();
    conversationRepository.seed(buildConversation({ sessionName: 'outra-sessao' }));

    const result = await sender.send('tenant-1', 'default', 'contact-1', 'Olá!');

    expect(result.ok).toBe(false);
  });

  it('propaga falha do provider como ok=false com o motivo, e NÃO cria Message', async () => {
    const { sender, registry, providerFactory, conversationRepository, messageRepository } =
      buildSut();
    conversationRepository.seed(buildConversation());

    // Resolve o SessionManager da MESMA forma que o sender vai resolver
    // (mesmo tenantId/sessionName), para configurar a falha na instância
    // real que será reaproveitada pelo Registry — mesmo padrão de
    // `OutboundCommandConsumer.test.ts`.
    registry.getOrCreate('tenant-1', 'default');
    const [provider] = providerFactory.getCreatedProviders();
    provider.nextSendMessageError = new WhatsAppNotConnectedError('tenant-1', 'default');

    const result = await sender.send('tenant-1', 'default', 'contact-1', 'Olá!');

    expect(result.ok).toBe(false);
    expect(result.failureReason).toContain('tenant-1');
    const messages = await messageRepository.listRecentByConversation(
      'tenant-1',
      'conversation-1',
      10,
    );
    expect(messages).toHaveLength(0);
  });
});
