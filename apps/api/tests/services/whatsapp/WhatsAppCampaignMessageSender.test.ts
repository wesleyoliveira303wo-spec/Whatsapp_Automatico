import { WhatsAppCampaignMessageSender } from '../../../src/services/whatsapp/infrastructure/WhatsAppCampaignMessageSender';
import { WhatsAppConnectionRegistry } from '../../../src/services/whatsapp/application/WhatsAppConnectionRegistry';
import { WhatsAppNotConnectedError } from '../../../src/services/whatsapp/domain/errors/WhatsAppNotConnectedError';
import { Conversation } from '../../../src/services/conversations/domain/entities/Conversation';
import { ContactPhoneLookup } from '../../../src/services/campaigns/domain/providers/ContactPhoneLookup';
import { FakeWhatsAppProviderFactory } from './infrastructure/FakeWhatsAppProviderFactory';
import { FakeWhatsAppSessionRepository, FakeWhatsAppSessionEventRepository } from './testDoubles';
import { FakeConversationRepository, FakeMessageRepository } from '../conversations/testDoubles';
import { AgentMediaCache } from '../../../src/services/conversations/infrastructure/AgentMediaCache';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';

/** Fake em memória de `ContactPhoneLookup` — Fase L, Bloco L5. */
class FakeContactPhoneLookup implements ContactPhoneLookup {
  private readonly contacts = new Map<string, { phoneE164: string; name?: string }>();

  seed(contactId: string, data: { phoneE164: string; name?: string }): void {
    this.contacts.set(contactId, data);
  }

  async findPhoneById(
    _tenantId: string,
    contactId: string,
  ): Promise<{ phoneE164: string; name?: string } | undefined> {
    return this.contacts.get(contactId);
  }
}

function buildSut(
  options: {
    sleepCalls?: number[];
    withContactPhoneLookup?: boolean;
    withAgentMediaCache?: boolean;
  } = {},
): {
  sender: WhatsAppCampaignMessageSender;
  registry: WhatsAppConnectionRegistry;
  providerFactory: FakeWhatsAppProviderFactory;
  conversationRepository: FakeConversationRepository;
  messageRepository: FakeMessageRepository;
  contactPhoneLookup: FakeContactPhoneLookup;
  agentMediaCache: AgentMediaCache;
} {
  const providerFactory = new FakeWhatsAppProviderFactory();
  const sessionRepo = new FakeWhatsAppSessionRepository();
  const eventRepo = new FakeWhatsAppSessionEventRepository();
  const logger = new NoopLogger();
  const registry = new WhatsAppConnectionRegistry(providerFactory, sessionRepo, logger, eventRepo);
  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();
  const contactPhoneLookup = new FakeContactPhoneLookup();
  const agentMediaCache = new AgentMediaCache();

  const sender = new WhatsAppCampaignMessageSender(
    registry,
    conversationRepository,
    messageRepository,
    logger,
    {
      // CORREÇÃO 2026-08-18 (retry): `sleepFn` fake, sem espera real — só
      // registra os `ms` pedidos em `options.sleepCalls`, quando o teste
      // quiser inspecioná-los (mesmo padrão de `GeminiAiProvider.test.ts`).
      sleepFn: (ms: number) => {
        options.sleepCalls?.push(ms);
        return Promise.resolve();
      },
    },
    options.withContactPhoneLookup === false ? undefined : contactPhoneLookup,
    options.withAgentMediaCache === false ? undefined : agentMediaCache,
  );

  return {
    sender,
    registry,
    providerFactory,
    conversationRepository,
    messageRepository,
    contactPhoneLookup,
    agentMediaCache,
  };
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
    archived: false,
    tags: [],
    aiSummaryMessageCount: 0,
    createdAt: new Date('2026-07-10T12:00:00Z'),
    updatedAt: new Date('2026-07-10T12:00:00Z'),
    ...overrides,
  };
}

describe('WhatsAppCampaignMessageSender (Fase L, Bloco L4)', () => {
  it('envia usando o contactJid da conversa JÁ EXISTENTE, nunca reconstruído de um telefone', async () => {
    const { sender, providerFactory, conversationRepository, messageRepository } = buildSut();
    conversationRepository.seed(buildConversation());

    const result = await sender.send('tenant-1', 'default', { contactId: 'contact-1' }, 'Olá!');

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

  it('propaga falha do provider (não retryable, ex.: erro genérico) como ok=false com o motivo, e NÃO cria Message', async () => {
    const { sender, registry, providerFactory, conversationRepository, messageRepository } =
      buildSut();
    conversationRepository.seed(buildConversation());

    registry.getOrCreate('tenant-1', 'default');
    const [provider] = providerFactory.getCreatedProviders();
    provider.nextSendMessageError = new Error('erro genérico do WhatsApp');

    const result = await sender.send('tenant-1', 'default', { contactId: 'contact-1' }, 'Olá!');

    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe('erro genérico do WhatsApp');
    expect(provider.sendMessageCalls).toHaveLength(0); // 1ª (e única) tentativa falhou antes de registrar a chamada
    const messages = await messageRepository.listRecentByConversation(
      'tenant-1',
      'conversation-1',
      10,
    );
    expect(messages).toHaveLength(0);
  });

  // CORREÇÃO 2026-08-18 (achado real: metade dos disparos de uma campanha
  // pequena caiu em WhatsAppNotConnectedError — a mesma instabilidade
  // momentânea de conexão já corrigida com retry em `whatsapp-outbound`).
  describe('retry em WhatsAppNotConnectedError (2026-08-18)', () => {
    it('recupera na retentativa: 1ª chamada falha (sessão desconectando), 2ª tem sucesso', async () => {
      const sleepCalls: number[] = [];
      const { sender, registry, providerFactory, conversationRepository, messageRepository } =
        buildSut({ sleepCalls });
      conversationRepository.seed(buildConversation());

      registry.getOrCreate('tenant-1', 'default');
      const [provider] = providerFactory.getCreatedProviders();
      provider.nextSendMessageError = new WhatsAppNotConnectedError('tenant-1', 'default');

      const result = await sender.send('tenant-1', 'default', { contactId: 'contact-1' }, 'Olá!');

      expect(result).toEqual({ ok: true, conversationId: 'conversation-1' });
      expect(sleepCalls).toEqual([5000]);
      const messages = await messageRepository.listRecentByConversation(
        'tenant-1',
        'conversation-1',
        10,
      );
      expect(messages).toHaveLength(1);
    });

    it('esgota as retentativas: falha em TODAS as tentativas propaga ok=false, sem criar Message', async () => {
      const sleepCalls: number[] = [];
      const { sender, registry, providerFactory, conversationRepository, messageRepository } =
        buildSut({ sleepCalls });
      conversationRepository.seed(buildConversation());

      registry.getOrCreate('tenant-1', 'default');
      const [provider] = providerFactory.getCreatedProviders();
      provider.sendMessage = async () => {
        throw new WhatsAppNotConnectedError('tenant-1', 'default');
      };

      const result = await sender.send('tenant-1', 'default', { contactId: 'contact-1' }, 'Olá!');

      expect(result.ok).toBe(false);
      expect(result.failureReason).toContain('tenant-1');
      // DEFAULT_MAX_RETRIES=2 → 3 tentativas no total, 2 esperas entre elas.
      expect(sleepCalls).toEqual([5000, 5000]);
      const messages = await messageRepository.listRecentByConversation(
        'tenant-1',
        'conversation-1',
        10,
      );
      expect(messages).toHaveLength(0);
    });

    it('erro que NÃO é WhatsAppNotConnectedError nunca retenta, mesmo com retry configurado', async () => {
      const sleepCalls: number[] = [];
      const { sender, registry, providerFactory, conversationRepository } = buildSut({
        sleepCalls,
      });
      conversationRepository.seed(buildConversation());

      registry.getOrCreate('tenant-1', 'default');
      const [provider] = providerFactory.getCreatedProviders();
      let callCount = 0;
      provider.sendMessage = async () => {
        callCount += 1;
        throw new Error('número inválido');
      };

      const result = await sender.send('tenant-1', 'default', { contactId: 'contact-1' }, 'Olá!');

      expect(result).toEqual({ ok: false, failureReason: 'número inválido' });
      expect(callCount).toBe(1);
      expect(sleepCalls).toEqual([]);
    });
  });

  // Fase L, Bloco L5 — primeiro contato (sem conversa prévia), risco aceito
  // explicitamente pelo fundador em 2026-08-18 (`FASE_L_MOTOR_DE_LEADS.md` §20).
  describe('primeiro contato — sem conversa prévia (Bloco L5)', () => {
    it('destinatário "solto" (sem contactId, phoneE164 direto): envia e CRIA a conversa com stage=contacted', async () => {
      const { sender, providerFactory, conversationRepository, messageRepository } = buildSut();
      // nenhuma conversa seedada — a pessoa nunca escreveu para este WhatsApp

      const result = await sender.send(
        'tenant-1',
        'default',
        { phoneE164: '5511988887777', name: 'Fulano' },
        'Olá, tudo bem?',
      );

      expect(result.ok).toBe(true);
      expect(result.conversationId).toBeDefined();
      const [provider] = providerFactory.getCreatedProviders();
      expect(provider.sendMessageCalls).toEqual([
        { to: '5511988887777@s.whatsapp.net', content: 'Olá, tudo bem?' },
      ]);

      const conversation = await conversationRepository.findById(result.conversationId!);
      expect(conversation).toMatchObject({
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511988887777@s.whatsapp.net',
        contactName: 'Fulano',
        contactId: undefined,
        stage: 'contacted',
        stageSetBy: 'ai',
      });

      const messages = await messageRepository.listRecentByConversation(
        'tenant-1',
        conversation!.id,
        10,
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ direction: 'outbound', content: 'Olá, tudo bem?' });
    });

    it('Contato salvo sem conversa nesta sessão: resolve o telefone via ContactPhoneLookup, envia e CRIA a conversa VINCULADA', async () => {
      const { sender, contactPhoneLookup, providerFactory, conversationRepository } = buildSut();
      contactPhoneLookup.seed('contact-9', { phoneE164: '5511977776666', name: 'Ciclana' });

      const result = await sender.send('tenant-1', 'default', { contactId: 'contact-9' }, 'Oi!');

      expect(result.ok).toBe(true);
      const [provider] = providerFactory.getCreatedProviders();
      expect(provider.sendMessageCalls).toEqual([
        { to: '5511977776666@s.whatsapp.net', content: 'Oi!' },
      ]);
      const conversation = await conversationRepository.findById(result.conversationId!);
      expect(conversation).toMatchObject({
        contactId: 'contact-9',
        contactJid: '5511977776666@s.whatsapp.net',
        contactName: 'Ciclana',
        stage: 'contacted',
      });
    });

    it('Contato salvo sem conversa nesta sessão E sem telefone resolvível (lookup ausente): ok=false, nunca tenta enviar', async () => {
      const { sender, providerFactory } = buildSut({ withContactPhoneLookup: false });

      const result = await sender.send('tenant-1', 'default', { contactId: 'contact-9' }, 'Oi!');

      expect(result).toEqual({ ok: false, failureReason: 'contato_sem_telefone_resolvivel' });
      expect(providerFactory.getCreatedProviders()).toHaveLength(0);
    });

    it('Contato salvo, mas o ContactPhoneLookup não o encontra (removido/outro tenant): ok=false', async () => {
      const { sender, providerFactory } = buildSut();
      // contactPhoneLookup vazio: nenhum seed para 'contact-inexistente'

      const result = await sender.send(
        'tenant-1',
        'default',
        { contactId: 'contact-inexistente' },
        'Oi!',
      );

      expect(result).toEqual({ ok: false, failureReason: 'contato_sem_telefone_resolvivel' });
      expect(providerFactory.getCreatedProviders()).toHaveLength(0);
    });

    it('nem contactId nem phoneE164: ok=false, nunca tenta enviar (defesa em profundidade, não deveria acontecer via CampaignService)', async () => {
      const { sender, providerFactory } = buildSut();

      const result = await sender.send('tenant-1', 'default', {}, 'Oi!');

      expect(result).toEqual({ ok: false, failureReason: 'sem_telefone_para_envio' });
      expect(providerFactory.getCreatedProviders()).toHaveLength(0);
    });

    it('falha no envio do primeiro contato: ok=false, NUNCA cria a conversa nem a Message', async () => {
      const { sender, registry, providerFactory, conversationRepository, messageRepository } =
        buildSut();
      registry.getOrCreate('tenant-1', 'default');
      const [provider] = providerFactory.getCreatedProviders();
      provider.nextSendMessageError = new Error('número inválido');

      const result = await sender.send(
        'tenant-1',
        'default',
        { phoneE164: '5511988887777' },
        'Olá!',
      );

      expect(result).toEqual({ ok: false, failureReason: 'número inválido' });
      const allConversations = await conversationRepository.findAllByTenant('tenant-1', {
        limit: 10,
      });
      expect(allConversations.conversations).toHaveLength(0);
      const messages = await messageRepository.listRecentByConversation('tenant-1', 'ignorado', 10);
      expect(messages).toHaveLength(0);
    });

    // Fase L, Bloco L8 (mídia na campanha).
    it('com mídia: usa sendMediaMessage (não sendMessage), content vira a legenda, Message grava contentType real', async () => {
      const { sender, providerFactory, conversationRepository, messageRepository } = buildSut();
      // nenhuma conversa seedada — primeiro contato, mesmo caminho do L5

      const result = await sender.send(
        'tenant-1',
        'default',
        { phoneE164: '5511988887777', name: 'Fulano' },
        'Confira nossa promoção!',
        {
          contentType: 'image',
          buffer: Buffer.from('bytes-da-imagem'),
          mimeType: 'image/jpeg',
          fileName: 'promo.jpg',
        },
      );

      expect(result.ok).toBe(true);
      const [provider] = providerFactory.getCreatedProviders();
      expect(provider.sendMessageCalls).toHaveLength(0);
      expect(provider.sendMediaMessageCalls).toEqual([
        {
          to: '5511988887777@s.whatsapp.net',
          media: {
            contentType: 'image',
            buffer: Buffer.from('bytes-da-imagem'),
            mimeType: 'image/jpeg',
            fileName: 'promo.jpg',
            caption: 'Confira nossa promoção!',
          },
        },
      ]);

      const conversation = await conversationRepository.findById(result.conversationId!);
      const messages = await messageRepository.listRecentByConversation(
        'tenant-1',
        conversation!.id,
        10,
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        direction: 'outbound',
        content: 'Confira nossa promoção!',
        contentType: 'image',
        media: { mimeType: 'image/jpeg', url: '', mediaKeyEncrypted: '', fileName: 'promo.jpg' },
      });
    });

    it('com mídia, reengajamento (conversa já existente): também usa sendMediaMessage', async () => {
      const { sender, providerFactory, conversationRepository } = buildSut();
      conversationRepository.seed(buildConversation());

      const result = await sender.send(
        'tenant-1',
        'default',
        { contactId: 'contact-1' },
        'Segue o catálogo',
        {
          contentType: 'document',
          buffer: Buffer.from('bytes-do-pdf'),
          mimeType: 'application/pdf',
        },
      );

      expect(result).toEqual({ ok: true, conversationId: 'conversation-1' });
      const [provider] = providerFactory.getCreatedProviders();
      expect(provider.sendMediaMessageCalls).toEqual([
        {
          to: '5511999999999@s.whatsapp.net',
          media: {
            contentType: 'document',
            buffer: Buffer.from('bytes-do-pdf'),
            mimeType: 'application/pdf',
            fileName: undefined,
            caption: 'Segue o catálogo',
          },
        },
      ]);
    });

    // CORREÇÃO 2026-08-20 — achado real: primeiro disparo de campanha com
    // imagem enviou certinho no WhatsApp, mas a prévia na Dashboard quebrou
    // ("Invalid initialization vector") porque nada populava o
    // `agentMediaCache`. Ver docstring do construtor.
    it('com mídia: popula agentMediaCache com o binário — é isso que sustenta a prévia na Dashboard', async () => {
      const { sender, conversationRepository, messageRepository, agentMediaCache } = buildSut();
      conversationRepository.seed(buildConversation());
      const buffer = Buffer.from('bytes-da-imagem');

      const result = await sender.send(
        'tenant-1',
        'default',
        { contactId: 'contact-1' },
        'Confira!',
        { contentType: 'image', buffer, mimeType: 'image/jpeg', fileName: 'promo.jpg' },
      );

      const [message] = await messageRepository.listRecentByConversation(
        'tenant-1',
        result.conversationId!,
        10,
      );
      const cached = agentMediaCache.get('tenant-1', message.id);
      expect(cached).toEqual({ mimeType: 'image/jpeg', fileName: 'promo.jpg', data: buffer });
    });

    it('sem agentMediaCache injetado: envio de mídia continua funcionando (só a prévia fica indisponível)', async () => {
      const { sender, conversationRepository } = buildSut({ withAgentMediaCache: false });
      conversationRepository.seed(buildConversation());

      const result = await sender.send(
        'tenant-1',
        'default',
        { contactId: 'contact-1' },
        'Confira!',
        { contentType: 'image', buffer: Buffer.from('bytes'), mimeType: 'image/jpeg' },
      );

      expect(result.ok).toBe(true);
    });

    it('sem mídia: continua usando sendMessage (comportamento original, inalterado)', async () => {
      const { sender, providerFactory, conversationRepository } = buildSut();
      conversationRepository.seed(buildConversation());

      await sender.send('tenant-1', 'default', { contactId: 'contact-1' }, 'Olá!');

      const [provider] = providerFactory.getCreatedProviders();
      expect(provider.sendMediaMessageCalls).toHaveLength(0);
      expect(provider.sendMessageCalls).toEqual([
        { to: '5511999999999@s.whatsapp.net', content: 'Olá!' },
      ]);
    });

    it('reengajamento é sempre tentado primeiro: mesmo com phoneE164 presente, uma conversa já existente vence', async () => {
      const { sender, providerFactory, conversationRepository } = buildSut();
      conversationRepository.seed(
        buildConversation({ contactJid: '5511999999999@s.whatsapp.net' }),
      );

      const result = await sender.send(
        'tenant-1',
        'default',
        { contactId: 'contact-1', phoneE164: '5511988887777' },
        'Olá!',
      );

      expect(result).toEqual({ ok: true, conversationId: 'conversation-1' });
      const [provider] = providerFactory.getCreatedProviders();
      // usa o contactJid da conversa EXISTENTE, não o phoneE164 do destinatário.
      expect(provider.sendMessageCalls).toEqual([
        { to: '5511999999999@s.whatsapp.net', content: 'Olá!' },
      ]);
    });
  });
});
