import { ConversationAiService } from '../../../src/services/ai/application/ConversationAiService';
import { PromptBuilder } from '../../../src/services/ai/application/PromptBuilder';
import { PromptVersion } from '../../../src/services/ai/domain/PromptVersion';
import { Message } from '../../../src/services/conversations/domain/entities/Message';
import { FakeAiProviderFactory } from './infrastructure/FakeAiProviderFactory';
import { FakeAiInteractionRepository } from './infrastructure/FakeAiInteractionRepository';
import { FakeAiBusinessProfileRepository } from './infrastructure/FakeAiBusinessProfileRepository';

const TENANT_ID = 'tenant-1';
const CONVERSATION_ID = 'conversation-1';

const PROMPT_VERSION: PromptVersion = {
  id: 'v1',
  systemPrompt: 'Você é um assistente de atendimento.',
  createdAt: '2026-07-10',
};

function buildMessages(): Message[] {
  return [
    {
      id: 'm1',
      tenantId: TENANT_ID,
      conversationId: CONVERSATION_ID,
      direction: 'inbound',
      content: 'Quero saber o preço',
      occurredAt: new Date('2026-07-10T12:00:00.000Z'),
    },
  ];
}

function buildSut(maxReplyLength?: number): {
  sut: ConversationAiService;
  aiProviderFactory: FakeAiProviderFactory;
  aiInteractionRepository: FakeAiInteractionRepository;
} {
  const aiProviderFactory = new FakeAiProviderFactory();
  const promptBuilder = new PromptBuilder();
  const aiInteractionRepository = new FakeAiInteractionRepository();
  const sut =
    maxReplyLength === undefined
      ? new ConversationAiService(aiProviderFactory, 'claude', promptBuilder, aiInteractionRepository)
      : new ConversationAiService(aiProviderFactory, 'claude', promptBuilder, aiInteractionRepository, maxReplyLength);
  return { sut, aiProviderFactory, aiInteractionRepository };
}

describe('ConversationAiService', () => {
  it('resolve o AiProvider pela AiProviderFactory usando o providerName configurado', async () => {
    const { sut, aiProviderFactory } = buildSut();

    await sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION);

    expect(aiProviderFactory.createCalls).toEqual(['claude']);
  });

  it('constrói a requisição via PromptBuilder e repassa ao AiProvider resolvido', async () => {
    const { sut, aiProviderFactory } = buildSut();

    await sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION);

    expect(aiProviderFactory.provider.generateReplyCalls).toEqual([
      {
        systemPrompt: 'Você é um assistente de atendimento.',
        messages: [{ role: 'user', content: 'Quero saber o preço' }],
      },
    ]);
  });

  it('devolve status "success" com a resposta sanitizada quando a geração e a validação são bem-sucedidas', async () => {
    const { sut, aiProviderFactory } = buildSut();
    aiProviderFactory.provider.setNextResult({
      content: '  Custa R$ 100.  ',
      model: 'claude-x',
      tokensInput: 12,
      tokensOutput: 8,
    });

    const result = await sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION);

    expect(result).toEqual({
      status: 'success',
      content: 'Custa R$ 100.',
      model: 'claude-x',
      tokensInput: 12,
      tokensOutput: 8,
      aiInteractionId: expect.any(String),
      escalate: false,
    });
  });

  it('marca escalate=true e REMOVE o marcador do content quando a IA sinaliza escalonamento (N2)', async () => {
    const { sut, aiProviderFactory } = buildSut();
    aiProviderFactory.provider.setNextResult({
      content: 'Vou te encaminhar para um atendente. [[ESCALAR_HUMANO]]',
      model: 'claude-x',
      tokensInput: 5,
      tokensOutput: 5,
    });

    const result = await sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.escalate).toBe(true);
      expect(result.content).toBe('Vou te encaminhar para um atendente.');
      expect(result.content).not.toContain('[[ESCALAR_HUMANO]]');
    }
  });

  it('devolve status "provider_error" quando o AiProvider lança uma exceção (não propaga)', async () => {
    const { sut, aiProviderFactory } = buildSut();
    aiProviderFactory.provider.setNextError(new Error('Falha de rede simulada'));

    const result = await sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION);

    expect(result).toEqual({ status: 'provider_error', errorMessage: 'Falha de rede simulada' });
  });

  it('devolve status "validation_rejected" quando a resposta gerada é vazia', async () => {
    const { sut, aiProviderFactory } = buildSut();
    aiProviderFactory.provider.setNextResult({ content: '   ', model: 'claude-x', tokensInput: 1, tokensOutput: 1 });

    const result = await sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION);

    expect(result).toEqual({ status: 'validation_rejected', reason: 'Resposta vazia' });
  });

  it('devolve status "validation_rejected" quando a resposta excede o maxReplyLength configurado', async () => {
    const { sut, aiProviderFactory } = buildSut(10);
    aiProviderFactory.provider.setNextResult({
      content: 'resposta muito mais longa que o limite',
      model: 'claude-x',
      tokensInput: 1,
      tokensOutput: 1,
    });

    const result = await sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION);

    expect(result.status).toBe('validation_rejected');
  });

  describe('gravação de AiInteraction (Bloco 3b)', () => {
    it('grava um AiInteraction com status "success" quando a geração e a validação são bem-sucedidas', async () => {
      const { sut, aiProviderFactory, aiInteractionRepository } = buildSut();
      aiProviderFactory.provider.setNextResult({
        content: 'Custa R$ 100.',
        model: 'claude-x',
        tokensInput: 12,
        tokensOutput: 8,
      });

      const result = await sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION);

      expect(aiInteractionRepository.getAll()).toHaveLength(1);
      const recorded = aiInteractionRepository.getAll()[0];
      expect(recorded).toMatchObject({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        provider: 'claude',
        model: 'claude-x',
        promptVersion: 'v1',
        tokensInput: 12,
        tokensOutput: 8,
        status: 'success',
      });
      expect(recorded.messageId).toBeUndefined();
      expect(typeof recorded.costUsd).toBe('string');
      expect(typeof recorded.latencyMs).toBe('number');
      // Bloco 4: o id devolvido no resultado é o MESMO id gerado por
      // record() para este AiInteraction — é essa correspondência que
      // permite ao worker de IA usar `result.aiInteractionId` para montar o
      // OutboundMessageCommand (D2/D3) e, depois, para
      // `aiInteractionRepository.linkMessage()`.
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.aiInteractionId).toBe(recorded.id);
      }
    });

    it('grava um AiInteraction com status "validation_rejected" e o motivo da rejeição em errorMessage', async () => {
      const { sut, aiProviderFactory, aiInteractionRepository } = buildSut();
      aiProviderFactory.provider.setNextResult({ content: '   ', model: 'claude-x', tokensInput: 3, tokensOutput: 2 });

      await sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION);

      expect(aiInteractionRepository.getAll()).toHaveLength(1);
      expect(aiInteractionRepository.getAll()[0]).toMatchObject({
        status: 'validation_rejected',
        errorMessage: 'Resposta vazia',
        model: 'claude-x',
        tokensInput: 3,
        tokensOutput: 2,
      });
    });

    it('grava um AiInteraction com status "provider_error", model undefined e tokens zerados quando o provider falha', async () => {
      const { sut, aiProviderFactory, aiInteractionRepository } = buildSut();
      aiProviderFactory.provider.setNextError(new Error('Falha de rede simulada'));

      await sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION);

      expect(aiInteractionRepository.getAll()).toHaveLength(1);
      expect(aiInteractionRepository.getAll()[0]).toMatchObject({
        status: 'provider_error',
        errorMessage: 'Falha de rede simulada',
        model: undefined,
        tokensInput: 0,
        tokensOutput: 0,
      });
    });

    it('propaga uma falha de AiInteractionRepository.record() (não engole, decisão deliberada do Bloco 3b)', async () => {
      const { sut, aiProviderFactory, aiInteractionRepository } = buildSut();
      aiProviderFactory.provider.setNextResult({ content: 'ok', model: 'claude-x', tokensInput: 1, tokensOutput: 1 });
      aiInteractionRepository.failNextRecord = true;

      await expect(sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION)).rejects.toThrow(
        'Falha simulada no AiInteractionRepository',
      );
    });
  });

  describe('Base de Conhecimento (Nível 1) — perfil de negócio no prompt', () => {
    function buildSutWithProfile(): {
      sut: ConversationAiService;
      aiProviderFactory: FakeAiProviderFactory;
      profileRepository: FakeAiBusinessProfileRepository;
    } {
      const aiProviderFactory = new FakeAiProviderFactory();
      const aiInteractionRepository = new FakeAiInteractionRepository();
      const profileRepository = new FakeAiBusinessProfileRepository();
      const sut = new ConversationAiService(
        aiProviderFactory,
        'claude',
        new PromptBuilder(),
        aiInteractionRepository,
        undefined,
        profileRepository,
      );
      return { sut, aiProviderFactory, profileRepository };
    }

    it('injeta o conteúdo do perfil do tenant no systemPrompt enviado ao provider', async () => {
      const { sut, aiProviderFactory, profileRepository } = buildSutWithProfile();
      profileRepository.seed(TENANT_ID, 'Salão da Maria. Corte R$ 50.');

      await sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION);

      const sentSystemPrompt = aiProviderFactory.provider.generateReplyCalls[0].systemPrompt;
      expect(sentSystemPrompt).toContain('Você é um assistente de atendimento.'); // base preservado
      expect(sentSystemPrompt).toContain('Salão da Maria. Corte R$ 50.'); // fatos do negócio
    });

    it('usa só o prompt base quando o tenant não tem perfil configurado', async () => {
      const { sut, aiProviderFactory } = buildSutWithProfile(); // repo vazio

      await sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION);

      expect(aiProviderFactory.provider.generateReplyCalls[0].systemPrompt).toBe('Você é um assistente de atendimento.');
    });

    it('degrada graciosamente (responde com o prompt base) quando a leitura do perfil falha', async () => {
      const { sut, aiProviderFactory, profileRepository } = buildSutWithProfile();
      profileRepository.seed(TENANT_ID, 'Salão da Maria.');
      profileRepository.failNextFind();

      const result = await sut.generateReply(TENANT_ID, CONVERSATION_ID, buildMessages(), PROMPT_VERSION);

      // A falha na base auxiliar NÃO derruba a resposta...
      expect(result.status).toBe('success');
      // ...e o prompt cai no base, sem o contexto do negócio.
      expect(aiProviderFactory.provider.generateReplyCalls[0].systemPrompt).toBe('Você é um assistente de atendimento.');
    });
  });
});
