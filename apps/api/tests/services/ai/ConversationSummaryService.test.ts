import { ConversationSummaryService } from '../../../src/services/ai/application/ConversationSummaryService';
import { ConversationNotFoundError } from '../../../src/services/conversations/domain/errors/ConversationNotFoundError';
import { ConversationSummaryUnavailableError } from '../../../src/services/ai/domain/errors/ConversationSummaryUnavailableError';
import { Conversation } from '../../../src/services/conversations/domain/entities/Conversation';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeConversationRepository, FakeMessageRepository } from '../conversations/testDoubles';
import { FakeAiInteractionRepository } from './infrastructure/FakeAiInteractionRepository';
import { FakeAiProvider } from './infrastructure/FakeAiProviderFactory';

const TENANT_ID = 'tenant-1';
const CONVERSATION_ID = 'conversation-1';

function buildConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: CONVERSATION_ID,
    tenantId: TENANT_ID,
    sessionName: 'default',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'bot',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: new Date('2026-08-06T12:00:00Z'),
    excludedFromPipeline: false,
    tags: [],
    aiSummaryMessageCount: 0,
    createdAt: new Date('2026-08-06T12:00:00Z'),
    updatedAt: new Date('2026-08-06T12:00:00Z'),
    ...overrides,
  };
}

function buildSut(options: { withProvider?: boolean; historyLimit?: number } = {}): {
  sut: ConversationSummaryService;
  conversationRepository: FakeConversationRepository;
  messageRepository: FakeMessageRepository;
  aiInteractionRepository: FakeAiInteractionRepository;
  aiProvider: FakeAiProvider;
} {
  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();
  const aiInteractionRepository = new FakeAiInteractionRepository();
  const aiProvider = new FakeAiProvider();
  const { withProvider = true, historyLimit } = options;

  const sut = new ConversationSummaryService(
    conversationRepository,
    messageRepository,
    aiInteractionRepository,
    'gemini',
    new NoopLogger(),
    withProvider ? aiProvider : undefined,
    historyLimit,
  );

  return { sut, conversationRepository, messageRepository, aiInteractionRepository, aiProvider };
}

describe('ConversationSummaryService (Redesign 2026-08-05, R5)', () => {
  it('lança um erro claro quando o AiProvider não está configurado', async () => {
    const { sut, conversationRepository, messageRepository } = buildSut({ withProvider: false });
    conversationRepository.seed(buildConversation());
    await messageRepository.create({
      tenantId: TENANT_ID,
      conversationId: CONVERSATION_ID,
      direction: 'inbound',
      content: 'Olá',
      contentType: 'text',
      occurredAt: new Date(),
    });

    await expect(sut.generateSummary(TENANT_ID, CONVERSATION_ID)).rejects.toThrow(
      'AiProvider não configurado',
    );
  });

  it('lança ConversationNotFoundError quando a conversa não existe', async () => {
    const { sut } = buildSut();
    await expect(sut.generateSummary(TENANT_ID, 'conversa-inexistente')).rejects.toThrow(
      ConversationNotFoundError,
    );
  });

  it('lança ConversationNotFoundError quando a conversa é de outro tenant (IDOR-safe)', async () => {
    const { sut, conversationRepository } = buildSut();
    conversationRepository.seed(buildConversation({ tenantId: 'tenant-2' }));

    await expect(sut.generateSummary(TENANT_ID, CONVERSATION_ID)).rejects.toThrow(
      ConversationNotFoundError,
    );
  });

  it('lança ConversationSummaryUnavailableError quando a conversa não tem mensagens', async () => {
    const { sut, conversationRepository } = buildSut();
    conversationRepository.seed(buildConversation());

    await expect(sut.generateSummary(TENANT_ID, CONVERSATION_ID)).rejects.toThrow(
      ConversationSummaryUnavailableError,
    );
  });

  it('gera o resumo, persiste via updateAiSummary e grava AiInteraction de sucesso', async () => {
    const { sut, conversationRepository, messageRepository, aiInteractionRepository, aiProvider } =
      buildSut();
    conversationRepository.seed(buildConversation());
    await messageRepository.create({
      tenantId: TENANT_ID,
      conversationId: CONVERSATION_ID,
      direction: 'inbound',
      content: 'Quero saber o preço',
      contentType: 'text',
      occurredAt: new Date('2026-08-06T10:00:00Z'),
    });
    await messageRepository.create({
      tenantId: TENANT_ID,
      conversationId: CONVERSATION_ID,
      direction: 'outbound',
      content: 'Custa R$ 100',
      contentType: 'text',
      occurredAt: new Date('2026-08-06T10:01:00Z'),
    });
    aiProvider.setNextResult({
      content: 'Cliente perguntou o preço, foi informado R$ 100.',
      model: 'gemini-3.5-flash',
      tokensInput: 50,
      tokensOutput: 20,
    });

    const updated = await sut.generateSummary(TENANT_ID, CONVERSATION_ID);

    expect(updated.aiSummary).toBe('Cliente perguntou o preço, foi informado R$ 100.');
    expect(updated.aiSummaryMessageCount).toBe(2);
    expect(updated.aiSummaryUpdatedAt).toBeInstanceOf(Date);

    const [interaction] = aiInteractionRepository.getAll();
    expect(interaction).toMatchObject({
      tenantId: TENANT_ID,
      conversationId: CONVERSATION_ID,
      provider: 'gemini',
      status: 'success',
      model: 'gemini-3.5-flash',
    });
  });

  it('monta o prompt em ordem cronológica (mais antiga primeiro), invertendo listRecentByConversation', async () => {
    const { sut, conversationRepository, messageRepository, aiProvider } = buildSut();
    conversationRepository.seed(buildConversation());
    await messageRepository.create({
      tenantId: TENANT_ID,
      conversationId: CONVERSATION_ID,
      direction: 'inbound',
      content: 'primeira',
      contentType: 'text',
      occurredAt: new Date('2026-08-06T10:00:00Z'),
    });
    await messageRepository.create({
      tenantId: TENANT_ID,
      conversationId: CONVERSATION_ID,
      direction: 'outbound',
      content: 'segunda',
      contentType: 'text',
      occurredAt: new Date('2026-08-06T10:01:00Z'),
    });
    await messageRepository.create({
      tenantId: TENANT_ID,
      conversationId: CONVERSATION_ID,
      direction: 'inbound',
      content: 'terceira',
      contentType: 'text',
      occurredAt: new Date('2026-08-06T10:02:00Z'),
    });

    await sut.generateSummary(TENANT_ID, CONVERSATION_ID);

    const [request] = aiProvider.generateReplyCalls;
    expect(request.messages.map((m) => m.content)).toEqual(['primeira', 'segunda', 'terceira']);
  });

  it('em falha do provider, grava AiInteraction com status provider_error e PROPAGA o erro (não persiste resumo)', async () => {
    const { sut, conversationRepository, messageRepository, aiInteractionRepository, aiProvider } =
      buildSut();
    conversationRepository.seed(buildConversation());
    await messageRepository.create({
      tenantId: TENANT_ID,
      conversationId: CONVERSATION_ID,
      direction: 'inbound',
      content: 'Olá',
      contentType: 'text',
      occurredAt: new Date(),
    });
    aiProvider.setNextError(new Error('Gemini API respondeu 503: sobrecarregado'));

    await expect(sut.generateSummary(TENANT_ID, CONVERSATION_ID)).rejects.toThrow(
      'Gemini API respondeu 503',
    );

    const [interaction] = aiInteractionRepository.getAll();
    expect(interaction).toMatchObject({
      status: 'provider_error',
      errorMessage: 'Gemini API respondeu 503: sobrecarregado',
    });

    const conversation = await conversationRepository.findById(CONVERSATION_ID);
    expect(conversation?.aiSummary).toBeUndefined();
  });

  it('respeita o historyLimit customizado ao buscar o histórico', async () => {
    const { sut, conversationRepository, messageRepository, aiProvider } = buildSut({
      historyLimit: 2,
    });
    conversationRepository.seed(buildConversation());
    for (let i = 1; i <= 5; i += 1) {
      await messageRepository.create({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        direction: 'inbound',
        content: `mensagem ${i}`,
        contentType: 'text',
        occurredAt: new Date(`2026-08-06T10:0${i}:00Z`),
      });
    }

    await sut.generateSummary(TENANT_ID, CONVERSATION_ID);

    const [request] = aiProvider.generateReplyCalls;
    expect(request.messages).toHaveLength(2);
    expect(request.messages.map((m) => m.content)).toEqual(['mensagem 4', 'mensagem 5']);
  });
});
