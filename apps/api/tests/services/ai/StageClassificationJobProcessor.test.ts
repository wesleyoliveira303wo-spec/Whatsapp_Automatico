import { StageClassificationJobProcessor } from '../../../src/services/ai/application/StageClassificationJobProcessor';
import { Conversation } from '../../../src/services/conversations/domain/entities/Conversation';
import { Message } from '../../../src/services/conversations/domain/entities/Message';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import {
  FakeAiAvailabilityRepository,
  FakeConversationRepository,
  FakeMessageRepository,
} from '../conversations/testDoubles';
import { FakeTenantPlanRepository } from '../conversations/FakeTenantPlanRepository';
import { FakeAiInteractionRepository } from './infrastructure/FakeAiInteractionRepository';
import { FakeAiProvider } from './infrastructure/FakeAiProviderFactory';

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    tenantId: 't1',
    sessionName: 'default',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'human',
    assignedToUserId: 'u1',
    unreadCount: 0,
    stage: 'contacted',
    stageSetBy: 'ai',
    stageUpdatedAt: new Date('2026-09-11T09:00:00Z'),
    excludedFromPipeline: false,
    archived: false,
    tags: [],
    createdAt: new Date('2026-09-11T09:00:00Z'),
    updatedAt: new Date('2026-09-11T09:00:00Z'),
    ...overrides,
  } as Conversation;
}

function message(id: string, occurredAt: string, direction: Message['direction'], content = id): Message {
  return {
    id,
    tenantId: 't1',
    conversationId: 'c1',
    direction,
    content,
    contentType: 'text',
    occurredAt: new Date(occurredAt),
    createdAt: new Date(occurredAt),
  } as Message;
}

function setup(conv: Conversation = conversation()): {
  processor: StageClassificationJobProcessor;
  conversationRepository: FakeConversationRepository;
  aiInteractionRepository: FakeAiInteractionRepository;
  availability: FakeAiAvailabilityRepository;
  plan: FakeTenantPlanRepository;
  provider: FakeAiProvider;
} {
  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();
  const aiInteractionRepository = new FakeAiInteractionRepository();
  const availability = new FakeAiAvailabilityRepository();
  const plan = new FakeTenantPlanRepository();
  const provider = new FakeAiProvider();
  conversationRepository.seed(conv);
  messageRepository.seed(message('m1', '2026-09-11T10:00:00Z', 'inbound', 'Quanto custa?'));
  messageRepository.seed(message('m2', '2026-09-11T10:01:00Z', 'outbound', 'R$ 990 no pix'));
  provider.setNextResult({
    content: '[[ESTAGIO:NEGOTIATING]]',
    model: 'fake-model',
    tokensInput: 100,
    tokensOutput: 5,
  });
  const processor = new StageClassificationJobProcessor(
    conversationRepository,
    messageRepository,
    aiInteractionRepository,
    availability,
    plan,
    provider,
    'gemini',
    new NoopLogger(),
  );
  return { processor, conversationRepository, aiInteractionRepository, availability, plan, provider };
}

const job = { tenantId: 't1', conversationId: 'c1', messageId: 'm2' };

describe('StageClassificationJobProcessor', () => {
  it('humano atendendo: classifica e AVANÇA o estágio, registrando a interação', async () => {
    const { processor, conversationRepository, aiInteractionRepository, provider } = setup();

    await expect(processor.process(job)).resolves.toBe('updated');

    expect(conversationRepository.getAll()[0]).toMatchObject({ stage: 'negotiating', stageSetBy: 'ai' });
    expect(provider.generateReplyCalls).toHaveLength(1);
    expect(aiInteractionRepository.getAll()).toHaveLength(1);
    expect(aiInteractionRepository.getAll()[0]).toMatchObject({
      status: 'success',
      promptVersion: 'stage-classifier-v1',
    });
  });

  it('nunca regride o funil (ADR #89)', async () => {
    const { processor, conversationRepository, provider } = setup(conversation({ stage: 'negotiating' }));
    provider.setNextResult({ content: '[[ESTAGIO:CONTACTED]]', model: 'm', tokensInput: 1, tokensOutput: 1 });

    await expect(processor.process(job)).resolves.toBe('unchanged');
    expect(conversationRepository.getAll()[0].stage).toBe('negotiating');
  });

  it('job de mensagem que NÃO é a mais recente: não gasta IA', async () => {
    const { processor, provider } = setup();

    await expect(processor.process({ ...job, messageId: 'm1' })).resolves.toBe('skipped');
    expect(provider.generateReplyCalls).toHaveLength(0);
  });

  it('IA ligada e respondendo a conversa: não gasta IA (a resposta já classifica)', async () => {
    const { processor, provider } = setup(conversation({ status: 'bot', assignedToUserId: undefined }));

    await expect(processor.process(job)).resolves.toBe('skipped');
    expect(provider.generateReplyCalls).toHaveLength(0);
  });

  it('IA desligada (Botão POWER) numa conversa em modo bot: classifica', async () => {
    const { processor, availability } = setup(conversation({ status: 'bot', assignedToUserId: undefined }));
    availability.setEnabled('t1', 'default', false);

    await expect(processor.process(job)).resolves.toBe('updated');
  });

  it('conversa fora do funil ou de outro tenant: não gasta IA', async () => {
    const excluded = setup(conversation({ excludedFromPipeline: true }));
    await expect(excluded.processor.process(job)).resolves.toBe('skipped');

    const other = setup();
    await expect(other.processor.process({ ...job, tenantId: 'outro' })).resolves.toBe('skipped');
    expect(other.provider.generateReplyCalls).toHaveLength(0);
  });

  it('Plano Grátis: não gasta IA', async () => {
    const { processor, plan, provider } = setup();
    plan.setPlan('free');

    await expect(processor.process(job)).resolves.toBe('skipped');
    expect(provider.generateReplyCalls).toHaveLength(0);
  });

  it('falha do provider (ex.: cota): registra e NÃO relança', async () => {
    const { processor, provider, aiInteractionRepository, conversationRepository } = setup();
    provider.setNextError(new Error('Gemini API respondeu 429'));

    await expect(processor.process(job)).resolves.toBe('provider_error');
    expect(aiInteractionRepository.getAll()[0]).toMatchObject({ status: 'provider_error' });
    expect(conversationRepository.getAll()[0].stage).toBe('contacted');
  });

  it('resposta sem marcador válido: não mexe no estágio', async () => {
    const { processor, provider, conversationRepository } = setup();
    provider.setNextResult({ content: 'Acho que está negociando.', model: 'm', tokensInput: 1, tokensOutput: 1 });

    await expect(processor.process(job)).resolves.toBe('no_stage_in_reply');
    expect(conversationRepository.getAll()[0].stage).toBe('contacted');
  });
});
