import { OutboundCommandConsumer } from '../../../src/services/whatsapp/infrastructure/OutboundCommandConsumer';
import { WhatsAppConnectionRegistry } from '../../../src/services/whatsapp/application/WhatsAppConnectionRegistry';
import { WhatsAppNotConnectedError } from '../../../src/services/whatsapp/domain/errors/WhatsAppNotConnectedError';
import { OutboundMessageCommand } from '../../../src/services/whatsapp/domain/dispatchers/OutboundMessageDispatcher';
import { Conversation } from '../../../src/services/conversations/domain/entities/Conversation';
import { FakeWhatsAppProviderFactory } from './infrastructure/FakeWhatsAppProviderFactory';
import { FakeWhatsAppSessionRepository, FakeWhatsAppSessionEventRepository } from './testDoubles';
import { FakeConversationRepository, FakeMessageRepository } from '../conversations/testDoubles';
import { FakeAiInteractionRepository } from '../ai/infrastructure/FakeAiInteractionRepository';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';

function buildSut(options: { sleepCalls?: number[] } = {}): {
  consumer: OutboundCommandConsumer;
  providerFactory: FakeWhatsAppProviderFactory;
  conversationRepository: FakeConversationRepository;
  messageRepository: FakeMessageRepository;
  aiInteractionRepository: FakeAiInteractionRepository;
} {
  const providerFactory = new FakeWhatsAppProviderFactory();
  const sessionRepo = new FakeWhatsAppSessionRepository();
  const eventRepo = new FakeWhatsAppSessionEventRepository();
  const logger = new NoopLogger();
  const registry = new WhatsAppConnectionRegistry(providerFactory, sessionRepo, logger, eventRepo);
  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();
  const aiInteractionRepository = new FakeAiInteractionRepository();

  // Onda 3 do redesign (2026-08-24) — `sleepFn` fake, sem espera real, só
  // registra os `ms` pedidos em `options.sleepCalls` quando o teste quiser
  // inspecioná-los (a pausa entre parágrafos migrou de `AiReplyJobProcessor`
  // para cá, ver docstring de `OutboundMessageCommand.content`).
  const sleepFn = (ms: number): Promise<void> => {
    options.sleepCalls?.push(ms);
    return Promise.resolve();
  };

  const consumer = new OutboundCommandConsumer(
    registry,
    conversationRepository,
    messageRepository,
    aiInteractionRepository,
    logger,
    undefined,
    sleepFn,
  );

  return {
    consumer,
    providerFactory,
    conversationRepository,
    messageRepository,
    aiInteractionRepository,
  };
}

function buildConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-1',
    tenantId: 'tenant-1',
    sessionName: 'default',
    contactJid: '5511999999999@s.whatsapp.net',
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

function buildCommand(overrides: Partial<OutboundMessageCommand> = {}): OutboundMessageCommand {
  return {
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    aiInteractionId: 'ai-interaction-1',
    content: ['Olá! Como posso ajudar?'],
    ...overrides,
  };
}

describe('OutboundCommandConsumer', () => {
  describe('consume() — caminho de sucesso', () => {
    it('envia via SessionManager.sendMessage() usando o contactJid/sessionName da Conversation, não do comando', async () => {
      const { consumer, providerFactory, conversationRepository } = buildSut();
      conversationRepository.seed(buildConversation());

      await consumer.consume(buildCommand());

      const [provider] = providerFactory.getCreatedProviders();
      expect(provider.sendMessageCalls).toEqual([
        { to: '5511999999999@s.whatsapp.net', content: 'Olá! Como posso ajudar?' },
      ]);
    });

    it('cria a Message outbound só depois do envio, com occurredAt/conteúdo corretos', async () => {
      const { consumer, conversationRepository, messageRepository } = buildSut();
      conversationRepository.seed(buildConversation());

      await consumer.consume(buildCommand());

      const created = messageRepository.getAll();
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'outbound',
        content: 'Olá! Como posso ajudar?',
      });
    });

    it('vincula o AiInteraction de origem à Message criada (linkMessage)', async () => {
      const { consumer, conversationRepository, messageRepository, aiInteractionRepository } =
        buildSut();
      conversationRepository.seed(buildConversation());

      await consumer.consume(buildCommand({ aiInteractionId: 'ai-interaction-42' }));

      const [created] = messageRepository.getAll();
      expect(aiInteractionRepository.linkMessageCalls).toEqual([
        { interactionId: 'ai-interaction-42', messageId: created.id },
      ]);
    });
  });

  /**
   * Onda 3 do redesign (2026-08-24) — CORREÇÃO ESTRUTURAL de um bug real
   * medido em produção ("o último balão vira o primeiro"): a pausa entre
   * parágrafos e o envio sequencial migraram de `AiReplyJobProcessor` (um
   * job/dispatch por parágrafo, sujeito a corrida entre jobs concorrentes da
   * mesma rajada) para AQUI — um único `consume()` envia todos os itens de
   * `command.content` em sequência, dentro da mesma execução, eliminando de
   * vez a possibilidade de corrida entre parágrafos da mesma resposta.
   */
  describe('consume() — múltiplos parágrafos (content: string[])', () => {
    it('envia cada item na ordem, com pausa entre eles (nunca antes do primeiro)', async () => {
      const sleepCalls: number[] = [];
      const { consumer, providerFactory, conversationRepository } = buildSut({ sleepCalls });
      conversationRepository.seed(buildConversation());

      await consumer.consume(
        buildCommand({ content: ['Oi! Tudo bem?', 'O valor é R$ 150.', 'Posso agendar?'] }),
      );

      const [provider] = providerFactory.getCreatedProviders();
      expect(provider.sendMessageCalls).toEqual([
        { to: '5511999999999@s.whatsapp.net', content: 'Oi! Tudo bem?' },
        { to: '5511999999999@s.whatsapp.net', content: 'O valor é R$ 150.' },
        { to: '5511999999999@s.whatsapp.net', content: 'Posso agendar?' },
      ]);
      // 3 parágrafos → 2 pausas (entre 1º-2º e 2º-3º), nunca antes do 1º.
      expect(sleepCalls).toHaveLength(2);
    });

    it('cria uma Message por parágrafo, cada uma com seu próprio conteúdo', async () => {
      const { consumer, conversationRepository, messageRepository } = buildSut();
      conversationRepository.seed(buildConversation());

      await consumer.consume(buildCommand({ content: ['Primeira.', 'Segunda.'] }));

      const created = messageRepository.getAll();
      expect(created).toHaveLength(2);
      expect(created.map((m) => m.content)).toEqual(['Primeira.', 'Segunda.']);
    });

    it('vincula o AiInteraction só à PRIMEIRA Message (nunca repete o vínculo por parágrafo)', async () => {
      const { consumer, conversationRepository, messageRepository, aiInteractionRepository } =
        buildSut();
      conversationRepository.seed(buildConversation());

      await consumer.consume(
        buildCommand({ aiInteractionId: 'ai-interaction-42', content: ['Primeira.', 'Segunda.'] }),
      );

      const [first] = messageRepository.getAll();
      expect(aiInteractionRepository.linkMessageCalls).toEqual([
        { interactionId: 'ai-interaction-42', messageId: first.id },
      ]);
    });

    it('resposta de um parágrafo só: sem nenhuma pausa (comportamento pré-existente preservado)', async () => {
      const sleepCalls: number[] = [];
      const { consumer, conversationRepository } = buildSut({ sleepCalls });
      conversationRepository.seed(buildConversation());

      await consumer.consume(buildCommand({ content: ['Corte custa R$ 50.'] }));

      expect(sleepCalls).toHaveLength(0);
    });
  });

  describe('consume() — mensagem do operador (N2, sem aiInteractionId)', () => {
    it('envia e cria a Message outbound, mas NÃO chama linkMessage (não há AiInteraction)', async () => {
      const {
        consumer,
        providerFactory,
        conversationRepository,
        messageRepository,
        aiInteractionRepository,
      } = buildSut();
      conversationRepository.seed(buildConversation());

      await consumer.consume(
        buildCommand({ aiInteractionId: undefined, idempotencyKey: 'agent-uuid-1' }),
      );

      const [provider] = providerFactory.getCreatedProviders();
      expect(provider.sendMessageCalls).toEqual([
        { to: '5511999999999@s.whatsapp.net', content: 'Olá! Como posso ajudar?' },
      ]);
      expect(messageRepository.getAll()).toHaveLength(1);
      expect(messageRepository.getAll()[0].direction).toBe('outbound');
      expect(aiInteractionRepository.linkMessageCalls).toHaveLength(0);
    });
  });

  describe('consume() — conversa não encontrada', () => {
    it('não lança, não envia mensagem e não cria Message/linkMessage (nada para quem enviar)', async () => {
      const { consumer, providerFactory, messageRepository, aiInteractionRepository } = buildSut();
      // Nenhum seed — conversationId não existe.

      await expect(consumer.consume(buildCommand())).resolves.toBeUndefined();

      expect(providerFactory.getCreatedProviders()).toHaveLength(0);
      expect(messageRepository.getAll()).toHaveLength(0);
      expect(aiInteractionRepository.linkMessageCalls).toHaveLength(0);
    });
  });

  describe('consume() — decisão D4: sessão sem conexão viva', () => {
    it('propaga WhatsAppNotConnectedError do provider sem capturar, e não cria Message/linkMessage (job deve falhar, não reconectar sozinho)', async () => {
      const providerFactory = new FakeWhatsAppProviderFactory();
      const sessionRepo = new FakeWhatsAppSessionRepository();
      const eventRepo = new FakeWhatsAppSessionEventRepository();
      const logger = new NoopLogger();
      const registry = new WhatsAppConnectionRegistry(
        providerFactory,
        sessionRepo,
        logger,
        eventRepo,
      );
      const conversationRepository = new FakeConversationRepository();
      const messageRepository = new FakeMessageRepository();
      const aiInteractionRepository = new FakeAiInteractionRepository();
      conversationRepository.seed(buildConversation());

      // Resolve o SessionManager da MESMA forma que o consumer vai resolver
      // (mesmo tenantId/sessionName), para configurar a falha na instância
      // real que será reaproveitada pelo Registry (getOrCreate() é
      // idempotente por par tenantId+sessionName).
      const sessionManager = registry.getOrCreate('tenant-1', 'default');
      void sessionManager;
      const [provider] = providerFactory.getCreatedProviders();
      provider.nextSendMessageError = new WhatsAppNotConnectedError('tenant-1', 'default');

      const consumer = new OutboundCommandConsumer(
        registry,
        conversationRepository,
        messageRepository,
        aiInteractionRepository,
        logger,
      );

      await expect(consumer.consume(buildCommand())).rejects.toThrow(WhatsAppNotConnectedError);
      expect(messageRepository.getAll()).toHaveLength(0);
      expect(aiInteractionRepository.linkMessageCalls).toHaveLength(0);
    });
  });
});
