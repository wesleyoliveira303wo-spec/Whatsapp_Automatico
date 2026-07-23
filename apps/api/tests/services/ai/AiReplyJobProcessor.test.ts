import { AiReplyJobProcessor } from '../../../src/services/ai/application/AiReplyJobProcessor';
import { ConversationAiService } from '../../../src/services/ai/application/ConversationAiService';
import { PromptBuilder } from '../../../src/services/ai/application/PromptBuilder';
import { PromptVersion } from '../../../src/services/ai/domain/PromptVersion';
import { AiReplyJobData } from '../../../src/services/conversations/infrastructure/queues/AiReplyQueue';
import { Conversation } from '../../../src/services/conversations/domain/entities/Conversation';
import { Message } from '../../../src/services/conversations/domain/entities/Message';
import { FakeConversationRepository, FakeMessageRepository } from '../conversations/testDoubles';
import { FakeAiProviderFactory } from './infrastructure/FakeAiProviderFactory';
import { FakeAiInteractionRepository } from './infrastructure/FakeAiInteractionRepository';
import { FakeOutboundMessageDispatcher } from '../whatsapp/infrastructure/FakeOutboundMessageDispatcher';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';

const TENANT_ID = 'tenant-1';
const CONVERSATION_ID = 'conversation-1';

const PROMPT_VERSION: PromptVersion = {
  id: 'v1',
  systemPrompt: 'Você é um assistente de atendimento.',
  createdAt: '2026-07-10',
};

function buildConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: CONVERSATION_ID,
    tenantId: TENANT_ID,
    sessionName: 'default',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'bot',
    createdAt: new Date('2026-07-10T12:00:00Z'),
    updatedAt: new Date('2026-07-10T12:00:00Z'),
    ...overrides,
  };
}

function buildJobData(overrides: Partial<AiReplyJobData> = {}): AiReplyJobData {
  return {
    tenantId: TENANT_ID,
    conversationId: CONVERSATION_ID,
    messageId: 'message-inbound-1',
    ...overrides,
  };
}

function buildMessage(overrides: Partial<Message> & Pick<Message, 'id' | 'occurredAt'>): Message {
  return {
    tenantId: TENANT_ID,
    conversationId: CONVERSATION_ID,
    direction: 'inbound',
    content: 'conteúdo padrão',
    ...overrides,
  };
}

function buildSut(historyLimit?: number): {
  processor: AiReplyJobProcessor;
  conversationRepository: FakeConversationRepository;
  messageRepository: FakeMessageRepository;
  aiProviderFactory: FakeAiProviderFactory;
  aiInteractionRepository: FakeAiInteractionRepository;
  outboundDispatcher: FakeOutboundMessageDispatcher;
} {
  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();
  const aiProviderFactory = new FakeAiProviderFactory();
  const aiInteractionRepository = new FakeAiInteractionRepository();
  const outboundDispatcher = new FakeOutboundMessageDispatcher();
  const conversationAiService = new ConversationAiService(
    aiProviderFactory,
    'claude',
    new PromptBuilder(),
    aiInteractionRepository,
  );
  const processor =
    historyLimit === undefined
      ? new AiReplyJobProcessor(
          conversationRepository,
          messageRepository,
          conversationAiService,
          outboundDispatcher,
          PROMPT_VERSION,
          new NoopLogger(),
        )
      : new AiReplyJobProcessor(
          conversationRepository,
          messageRepository,
          conversationAiService,
          outboundDispatcher,
          PROMPT_VERSION,
          new NoopLogger(),
          historyLimit,
        );

  return { processor, conversationRepository, messageRepository, aiProviderFactory, aiInteractionRepository, outboundDispatcher };
}

describe('AiReplyJobProcessor', () => {
  describe('process() — caminho de sucesso', () => {
    it('busca o histórico, inverte para ordem cronológica e repassa ao ConversationAiService', async () => {
      const { processor, conversationRepository, messageRepository, aiProviderFactory } = buildSut();
      conversationRepository.seed(buildConversation());
      await messageRepository.create(
        buildMessage({ id: 'm1', content: 'primeira mensagem', occurredAt: new Date('2026-07-10T12:00:00Z') }),
      );
      await messageRepository.create(
        buildMessage({ id: 'm2', content: 'segunda mensagem', occurredAt: new Date('2026-07-10T12:01:00Z') }),
      );
      aiProviderFactory.provider.setNextResult({ content: 'resposta', model: 'claude-x', tokensInput: 1, tokensOutput: 1 });

      await processor.process(buildJobData());

      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(1);
      expect(aiProviderFactory.provider.generateReplyCalls[0].messages).toEqual([
        { role: 'user', content: 'primeira mensagem' },
        { role: 'user', content: 'segunda mensagem' },
      ]);
    });

    it('despacha via OutboundMessageDispatcher com aiInteractionId/content corretos quando a geração é bem-sucedida', async () => {
      const { processor, conversationRepository, aiProviderFactory, aiInteractionRepository, outboundDispatcher } = buildSut();
      conversationRepository.seed(buildConversation());
      aiProviderFactory.provider.setNextResult({
        content: '  Olá, tudo bem?  ',
        model: 'claude-x',
        tokensInput: 5,
        tokensOutput: 5,
      });

      await processor.process(buildJobData());

      const [recorded] = aiInteractionRepository.getAll();
      expect(outboundDispatcher.dispatchCalls).toEqual([
        {
          tenantId: TENANT_ID,
          conversationId: CONVERSATION_ID,
          aiInteractionId: recorded.id,
          content: 'Olá, tudo bem?',
        },
      ]);
    });

    it('respeita o historyLimit configurado (mensagens mais antigas além do limite são descartadas)', async () => {
      const { processor, conversationRepository, messageRepository, aiProviderFactory } = buildSut(1);
      conversationRepository.seed(buildConversation());
      await messageRepository.create(
        buildMessage({ id: 'm1', content: 'mais antiga', occurredAt: new Date('2026-07-10T12:00:00Z') }),
      );
      await messageRepository.create(
        buildMessage({ id: 'm2', content: 'mais recente', occurredAt: new Date('2026-07-10T12:01:00Z') }),
      );

      await processor.process(buildJobData());

      expect(aiProviderFactory.provider.generateReplyCalls[0].messages).toEqual([{ role: 'user', content: 'mais recente' }]);
    });
  });

  describe('process() — auto-escalonamento (N2)', () => {
    it('IA emite o marcador: envia a mensagem SEM o marcador e coloca a conversa em "human" sem dono (fila de espera)', async () => {
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } = buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiProviderFactory.provider.setNextResult({
        content: 'Vou te encaminhar para um atendente. [[ESCALAR_HUMANO]]',
        model: 'claude-x',
        tokensInput: 5,
        tokensOutput: 5,
      });

      await processor.process(buildJobData());

      // A mensagem enviada NÃO contém o marcador.
      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
      expect(outboundDispatcher.dispatchCalls[0].content).toBe('Vou te encaminhar para um atendente.');
      // A conversa foi para atendimento humano, sem dono (aguardando).
      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.status).toBe('human');
      expect(updated?.assignedToUserId).toBeUndefined();
    });

    it('resposta normal (sem marcador): NÃO mexe no status da conversa', async () => {
      const { processor, conversationRepository, aiProviderFactory } = buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiProviderFactory.provider.setNextResult({ content: 'Corte custa R$ 50.', model: 'claude-x', tokensInput: 1, tokensOutput: 1 });

      await processor.process(buildJobData());

      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.status).toBe('bot');
    });
  });

  describe('process() — conversa não encontrada', () => {
    it('não lança, não chama o provider de IA e não despacha nada', async () => {
      const { processor, aiProviderFactory, outboundDispatcher } = buildSut();
      // Nenhum seed — conversationId não existe.

      await expect(processor.process(buildJobData())).resolves.toBeUndefined();

      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(0);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
    });
  });

  describe('process() — re-checagem de shouldAutoRespond()', () => {
    it('conversa escalonada para humano (status "human") não gera resposta nem despacha (achado da Milestone §5)', async () => {
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } = buildSut();
      conversationRepository.seed(buildConversation({ status: 'human' }));

      await processor.process(buildJobData());

      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(0);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
    });
  });

  describe('process() — resultado não enviável', () => {
    it('validation_rejected: não despacha nada (mas ConversationAiService já gravou o AiInteraction)', async () => {
      const { processor, conversationRepository, aiProviderFactory, aiInteractionRepository, outboundDispatcher } = buildSut();
      conversationRepository.seed(buildConversation());
      aiProviderFactory.provider.setNextResult({ content: '   ', model: 'claude-x', tokensInput: 1, tokensOutput: 1 });

      await processor.process(buildJobData());

      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
      expect(aiInteractionRepository.getAll()).toHaveLength(1);
      expect(aiInteractionRepository.getAll()[0].status).toBe('validation_rejected');
    });

    it('provider_error: não despacha nada (mas ConversationAiService já gravou o AiInteraction)', async () => {
      const { processor, conversationRepository, aiProviderFactory, aiInteractionRepository, outboundDispatcher } = buildSut();
      conversationRepository.seed(buildConversation());
      aiProviderFactory.provider.setNextError(new Error('Falha de rede simulada'));

      await processor.process(buildJobData());

      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
      expect(aiInteractionRepository.getAll()).toHaveLength(1);
      expect(aiInteractionRepository.getAll()[0].status).toBe('provider_error');
    });
  });

  describe('process() — falha do OutboundMessageDispatcher', () => {
    it('propaga a falha (não engole) — deixa o BullMQ retentar o job ai-reply', async () => {
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } = buildSut();
      conversationRepository.seed(buildConversation());
      aiProviderFactory.provider.setNextResult({ content: 'ok', model: 'claude-x', tokensInput: 1, tokensOutput: 1 });
      outboundDispatcher.failNextDispatch = true;

      await expect(processor.process(buildJobData())).rejects.toThrow('Falha simulada no OutboundMessageDispatcher');
    });
  });
});
