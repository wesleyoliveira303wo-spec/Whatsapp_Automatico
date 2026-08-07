import { ConversationAiService } from '../../../src/services/ai/application/ConversationAiService';
import { PromptBuilder } from '../../../src/services/ai/application/PromptBuilder';
import { PromptVersion } from '../../../src/services/ai/domain/PromptVersion';
import { Message } from '../../../src/services/conversations/domain/entities/Message';
import { FakeAiProviderFactory } from './infrastructure/FakeAiProviderFactory';
import { FakeAiInteractionRepository } from './infrastructure/FakeAiInteractionRepository';
import { FakeAiBusinessProfileRepository } from './infrastructure/FakeAiBusinessProfileRepository';
import { FakeMediaDownloader } from '../whatsapp/infrastructure/FakeMediaDownloader';

const TENANT_ID = 'tenant-1';
const CONVERSATION_ID = 'conversation-1';
const SESSION_NAME = 'sessao-1';

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
      contentType: 'text',
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
      ? new ConversationAiService(
          aiProviderFactory,
          'claude',
          promptBuilder,
          aiInteractionRepository,
        )
      : new ConversationAiService(
          aiProviderFactory,
          'claude',
          promptBuilder,
          aiInteractionRepository,
          maxReplyLength,
        );
  return { sut, aiProviderFactory, aiInteractionRepository };
}

describe('ConversationAiService', () => {
  it('resolve o AiProvider pela AiProviderFactory usando o providerName configurado', async () => {
    const { sut, aiProviderFactory } = buildSut();

    await sut.generateReply(
      TENANT_ID,
      CONVERSATION_ID,
      buildMessages(),
      PROMPT_VERSION,
      SESSION_NAME,
    );

    expect(aiProviderFactory.createCalls).toEqual(['claude']);
  });

  it('constrói a requisição via PromptBuilder e repassa ao AiProvider resolvido', async () => {
    const { sut, aiProviderFactory } = buildSut();

    await sut.generateReply(
      TENANT_ID,
      CONVERSATION_ID,
      buildMessages(),
      PROMPT_VERSION,
      SESSION_NAME,
    );

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

    const result = await sut.generateReply(
      TENANT_ID,
      CONVERSATION_ID,
      buildMessages(),
      PROMPT_VERSION,
      SESSION_NAME,
    );

    expect(result).toEqual({
      status: 'success',
      content: 'Custa R$ 100.',
      model: 'claude-x',
      tokensInput: 12,
      tokensOutput: 8,
      aiInteractionId: expect.any(String),
      escalationReason: undefined,
      suggestedStage: undefined,
    });
  });

  it('marca escalationReason="unknown_answer" e REMOVE o marcador do content quando a IA não sabe responder (N2/F1.4)', async () => {
    const { sut, aiProviderFactory } = buildSut();
    aiProviderFactory.provider.setNextResult({
      content: 'Vou te encaminhar para um atendente. [[ESCALAR_HUMANO:NAO_SEI]]',
      model: 'claude-x',
      tokensInput: 5,
      tokensOutput: 5,
    });

    const result = await sut.generateReply(
      TENANT_ID,
      CONVERSATION_ID,
      buildMessages(),
      PROMPT_VERSION,
      SESSION_NAME,
    );

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.escalationReason).toBe('unknown_answer');
      expect(result.content).toBe('Vou te encaminhar para um atendente.');
      expect(result.content).not.toContain('[[ESCALAR_HUMANO:NAO_SEI]]');
    }
  });

  it('marca escalationReason="requested_human" quando o cliente pediu para falar com uma pessoa (F1.4)', async () => {
    const { sut, aiProviderFactory } = buildSut();
    aiProviderFactory.provider.setNextResult({
      content: 'Claro, já vou te encaminhar. [[ESCALAR_HUMANO:PEDIU_ATENDENTE]]',
      model: 'claude-x',
      tokensInput: 5,
      tokensOutput: 5,
    });

    const result = await sut.generateReply(
      TENANT_ID,
      CONVERSATION_ID,
      buildMessages(),
      PROMPT_VERSION,
      SESSION_NAME,
    );

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.escalationReason).toBe('requested_human');
      expect(result.content).toBe('Claro, já vou te encaminhar.');
    }
  });

  describe('pipeline de CRM: sugestão de estágio (Milestone 6, Bloco M6H-5)', () => {
    it('extrai suggestedStage e REMOVE o marcador do content quando a IA classifica o estágio', async () => {
      const { sut, aiProviderFactory } = buildSut();
      aiProviderFactory.provider.setNextResult({
        content: 'Qual seria o melhor horário pra você? [[ESTAGIO:NEGOTIATING]]',
        model: 'claude-x',
        tokensInput: 5,
        tokensOutput: 5,
      });

      const result = await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        buildMessages(),
        PROMPT_VERSION,
        SESSION_NAME,
      );

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.suggestedStage).toBe('negotiating');
        expect(result.content).toBe('Qual seria o melhor horário pra você?');
        expect(result.content).not.toContain('[[ESTAGIO');
      }
    });

    it('suggestedStage undefined quando a resposta não inclui o marcador de estágio', async () => {
      const { sut, aiProviderFactory } = buildSut();
      aiProviderFactory.provider.setNextResult({
        content: 'Custa R$ 100.',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      const result = await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        buildMessages(),
        PROMPT_VERSION,
        SESSION_NAME,
      );

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.suggestedStage).toBeUndefined();
      }
    });

    it('remove tanto o marcador de escalonamento quanto o de estágio quando os dois aparecem na mesma resposta', async () => {
      const { sut, aiProviderFactory } = buildSut();
      aiProviderFactory.provider.setNextResult({
        content:
          'Vou te encaminhar para um atendente. [[ESCALAR_HUMANO:NAO_SEI]] [[ESTAGIO:CONTACTED]]',
        model: 'claude-x',
        tokensInput: 5,
        tokensOutput: 5,
      });

      const result = await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        buildMessages(),
        PROMPT_VERSION,
        SESSION_NAME,
      );

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.escalationReason).toBe('unknown_answer');
        expect(result.suggestedStage).toBe('contacted');
        expect(result.content).toBe('Vou te encaminhar para um atendente.');
      }
    });
  });

  it('devolve status "provider_error" quando o AiProvider lança uma exceção (não propaga)', async () => {
    const { sut, aiProviderFactory } = buildSut();
    aiProviderFactory.provider.setNextError(new Error('Falha de rede simulada'));

    const result = await sut.generateReply(
      TENANT_ID,
      CONVERSATION_ID,
      buildMessages(),
      PROMPT_VERSION,
      SESSION_NAME,
    );

    expect(result).toEqual({ status: 'provider_error', errorMessage: 'Falha de rede simulada' });
  });

  it('devolve status "validation_rejected" quando a resposta gerada é vazia', async () => {
    const { sut, aiProviderFactory } = buildSut();
    aiProviderFactory.provider.setNextResult({
      content: '   ',
      model: 'claude-x',
      tokensInput: 1,
      tokensOutput: 1,
    });

    const result = await sut.generateReply(
      TENANT_ID,
      CONVERSATION_ID,
      buildMessages(),
      PROMPT_VERSION,
      SESSION_NAME,
    );

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

    const result = await sut.generateReply(
      TENANT_ID,
      CONVERSATION_ID,
      buildMessages(),
      PROMPT_VERSION,
      SESSION_NAME,
    );

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

      const result = await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        buildMessages(),
        PROMPT_VERSION,
        SESSION_NAME,
      );

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

    it('Fase 1, Bloco F1.4: grava messageId (mensagem inbound que originou a chamada) quando informado, em toda tentativa', async () => {
      const { sut, aiProviderFactory, aiInteractionRepository } = buildSut();
      aiProviderFactory.provider.setNextResult({
        content: 'Custa R$ 100.',
        model: 'claude-x',
        tokensInput: 12,
        tokensOutput: 8,
      });

      await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        buildMessages(),
        PROMPT_VERSION,
        SESSION_NAME,
        'm1',
      );

      const recorded = aiInteractionRepository.getAll()[0];
      expect(recorded.messageId).toBe('m1');
    });

    it('Fase 1, Bloco F1.4: grava escalationReason no AiInteraction quando a IA escala por não saber responder', async () => {
      const { sut, aiProviderFactory, aiInteractionRepository } = buildSut();
      aiProviderFactory.provider.setNextResult({
        content: 'Vou encaminhar você. [[ESCALAR_HUMANO:NAO_SEI]]',
        model: 'claude-x',
        tokensInput: 5,
        tokensOutput: 5,
      });

      await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        buildMessages(),
        PROMPT_VERSION,
        SESSION_NAME,
        'm1',
      );

      const recorded = aiInteractionRepository.getAll()[0];
      expect(recorded.escalationReason).toBe('unknown_answer');
      expect(recorded.messageId).toBe('m1');
    });

    it('grava um AiInteraction com status "validation_rejected" e o motivo da rejeição em errorMessage', async () => {
      const { sut, aiProviderFactory, aiInteractionRepository } = buildSut();
      aiProviderFactory.provider.setNextResult({
        content: '   ',
        model: 'claude-x',
        tokensInput: 3,
        tokensOutput: 2,
      });

      await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        buildMessages(),
        PROMPT_VERSION,
        SESSION_NAME,
      );

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

      await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        buildMessages(),
        PROMPT_VERSION,
        SESSION_NAME,
      );

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
      aiProviderFactory.provider.setNextResult({
        content: 'ok',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });
      aiInteractionRepository.failNextRecord = true;

      await expect(
        sut.generateReply(
          TENANT_ID,
          CONVERSATION_ID,
          buildMessages(),
          PROMPT_VERSION,
          SESSION_NAME,
        ),
      ).rejects.toThrow('Falha simulada no AiInteractionRepository');
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
      profileRepository.seed(TENANT_ID, SESSION_NAME, 'Salão da Maria. Corte R$ 50.');

      await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        buildMessages(),
        PROMPT_VERSION,
        SESSION_NAME,
      );

      const sentSystemPrompt = aiProviderFactory.provider.generateReplyCalls[0].systemPrompt;
      expect(sentSystemPrompt).toContain('Você é um assistente de atendimento.'); // base preservado
      expect(sentSystemPrompt).toContain('Salão da Maria. Corte R$ 50.'); // fatos do negócio
    });

    it('usa só o prompt base quando o tenant não tem perfil configurado', async () => {
      const { sut, aiProviderFactory } = buildSutWithProfile(); // repo vazio

      await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        buildMessages(),
        PROMPT_VERSION,
        SESSION_NAME,
      );

      expect(aiProviderFactory.provider.generateReplyCalls[0].systemPrompt).toBe(
        'Você é um assistente de atendimento.',
      );
    });

    it('degrada graciosamente (responde com o prompt base) quando a leitura do perfil falha', async () => {
      const { sut, aiProviderFactory, profileRepository } = buildSutWithProfile();
      profileRepository.seed(TENANT_ID, SESSION_NAME, 'Salão da Maria.');
      profileRepository.failNextFind();

      const result = await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        buildMessages(),
        PROMPT_VERSION,
        SESSION_NAME,
      );

      // A falha na base auxiliar NÃO derruba a resposta...
      expect(result.status).toBe('success');
      // ...e o prompt cai no base, sem o contexto do negócio.
      expect(aiProviderFactory.provider.generateReplyCalls[0].systemPrompt).toBe(
        'Você é um assistente de atendimento.',
      );
    });

    /**
     * F1.8: quando o perfil tem `offHoursEnabled: true` e a mensagem chega
     * fora do expediente, o aviso de horário é injetado no systemPrompt.
     *
     * `loadProfileContext` chama `getOffHoursContext(profile)` que usa
     * `new Date()` por padrão — controlamos via `jest.setSystemTime()`.
     *
     * Usa Sábado 10h SP (= 2026-08-08T13:00:00Z), fora de Mon–Sex.
     */
    it('F1.8: injeta aviso de horário quando o perfil tem offHoursEnabled e a mensagem chega fora do expediente', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-08T13:00:00Z')); // Sábado 10h SP
      try {
        const { sut, aiProviderFactory, profileRepository } = buildSutWithProfile();
        profileRepository.seed(TENANT_ID, SESSION_NAME, 'Salão da Maria.', {
          offHoursEnabled: true,
          workingHoursStart: '08:00',
          workingHoursEnd: '18:00',
          workingDays: 62, // Mon–Sex
          timezone: 'America/Sao_Paulo',
          offHoursMessage: null,
        });

        await sut.generateReply(
          TENANT_ID,
          CONVERSATION_ID,
          buildMessages(),
          PROMPT_VERSION,
          SESSION_NAME,
        );

        const sentSystemPrompt = aiProviderFactory.provider.generateReplyCalls[0].systemPrompt;
        // Prompt base e contexto do negócio preservados
        expect(sentSystemPrompt).toContain('Você é um assistente de atendimento.');
        expect(sentSystemPrompt).toContain('Salão da Maria.');
        // Aviso de horário injetado após
        expect(sentSystemPrompt).toContain('Aviso de Horário de Atendimento');
      } finally {
        jest.useRealTimers();
      }
    });

    it('F1.8: NÃO injeta aviso de horário quando a mensagem chega dentro do expediente', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-05T12:00:00Z')); // Quarta 09h SP
      try {
        const { sut, aiProviderFactory, profileRepository } = buildSutWithProfile();
        profileRepository.seed(TENANT_ID, SESSION_NAME, 'Salão da Maria.', {
          offHoursEnabled: true,
          workingHoursStart: '08:00',
          workingHoursEnd: '18:00',
          workingDays: 62, // Mon–Sex
          timezone: 'America/Sao_Paulo',
          offHoursMessage: null,
        });

        await sut.generateReply(
          TENANT_ID,
          CONVERSATION_ID,
          buildMessages(),
          PROMPT_VERSION,
          SESSION_NAME,
        );

        const sentSystemPrompt = aiProviderFactory.provider.generateReplyCalls[0].systemPrompt;
        expect(sentSystemPrompt).not.toContain('Aviso de Horário de Atendimento');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('interpretação de mídia (Fase 1, Bloco F1.2)', () => {
    function buildSutWithMediaDownloader(): {
      sut: ConversationAiService;
      aiProviderFactory: FakeAiProviderFactory;
      mediaDownloader: FakeMediaDownloader;
    } {
      const aiProviderFactory = new FakeAiProviderFactory();
      const promptBuilder = new PromptBuilder();
      const aiInteractionRepository = new FakeAiInteractionRepository();
      const mediaDownloader = new FakeMediaDownloader();
      const sut = new ConversationAiService(
        aiProviderFactory,
        'gemini',
        promptBuilder,
        aiInteractionRepository,
        undefined,
        undefined,
        mediaDownloader,
      );
      return { sut, aiProviderFactory, mediaDownloader };
    }

    function buildImageMessage(overrides: Partial<Message> = {}): Message {
      return {
        id: 'm-image',
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        direction: 'inbound',
        content: '',
        contentType: 'image',
        media: { mimeType: 'image/jpeg', url: 'https://x.enc', mediaKeyEncrypted: 'enc:abc' },
        occurredAt: new Date('2026-07-10T12:00:00.000Z'),
        ...overrides,
      };
    }

    it('baixa a mídia via MediaDownloader e anexa o base64 à mensagem correspondente', async () => {
      const { sut, aiProviderFactory, mediaDownloader } = buildSutWithMediaDownloader();
      mediaDownloader.nextResult = Buffer.from('bytes-da-imagem');

      await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        [buildImageMessage()],
        PROMPT_VERSION,
        SESSION_NAME,
      );

      expect(mediaDownloader.downloadCalls).toEqual([
        {
          tenantId: TENANT_ID,
          sessionName: SESSION_NAME,
          media: {
            contentType: 'image',
            mimeType: 'image/jpeg',
            url: 'https://x.enc',
            mediaKeyEncrypted: 'enc:abc',
          },
        },
      ]);
      expect(aiProviderFactory.provider.generateReplyCalls[0].messages[0].media).toEqual({
        mimeType: 'image/jpeg',
        data: Buffer.from('bytes-da-imagem').toString('base64'),
      });
    });

    it('sem MediaDownloader configurado: não baixa nada, a IA recebe só a descrição factual', async () => {
      const { sut, aiProviderFactory } = buildSut();

      await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        [buildImageMessage()],
        PROMPT_VERSION,
        SESSION_NAME,
      );

      expect(aiProviderFactory.provider.generateReplyCalls[0].messages[0]).toEqual({
        role: 'user',
        content: '[O cliente enviou um(a) imagem, sem legenda]',
      });
    });

    it('MediaDownloader devolve undefined (falha/indisponível): degrada graciosamente, sem media anexado', async () => {
      const { sut, aiProviderFactory, mediaDownloader } = buildSutWithMediaDownloader();
      mediaDownloader.nextResult = undefined;

      await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        [buildImageMessage()],
        PROMPT_VERSION,
        SESSION_NAME,
      );

      expect(aiProviderFactory.provider.generateReplyCalls[0].messages[0].media).toBeUndefined();
    });

    it('mídia maior que o teto: descarta o binário, sem media anexado (nunca lança)', async () => {
      const { sut, aiProviderFactory, mediaDownloader } = buildSutWithMediaDownloader();
      mediaDownloader.nextResult = Buffer.alloc(11 * 1024 * 1024);

      await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        [buildImageMessage()],
        PROMPT_VERSION,
        SESSION_NAME,
      );

      expect(aiProviderFactory.provider.generateReplyCalls[0].messages[0].media).toBeUndefined();
    });

    it('só baixa a mídia mais RECENTE do histórico (nunca todo o histórico)', async () => {
      const { sut, aiProviderFactory, mediaDownloader } = buildSutWithMediaDownloader();

      await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        [
          buildImageMessage({
            id: 'm-image-1',
            media: { mimeType: 'image/jpeg', url: 'https://um.enc', mediaKeyEncrypted: 'enc:1' },
          }),
          { ...buildMessages()[0], id: 'm-texto' },
          buildImageMessage({
            id: 'm-image-2',
            media: { mimeType: 'image/png', url: 'https://dois.enc', mediaKeyEncrypted: 'enc:2' },
          }),
        ],
        PROMPT_VERSION,
        SESSION_NAME,
      );

      expect(mediaDownloader.downloadCalls).toHaveLength(1);
      expect(mediaDownloader.downloadCalls[0].media.url).toBe('https://dois.enc');
      expect(aiProviderFactory.provider.generateReplyCalls[0].messages[2].media).toBeDefined();
      expect(aiProviderFactory.provider.generateReplyCalls[0].messages[0].media).toBeUndefined();
    });

    it('ignora mensagens de vídeo/documento/figurinha (restrito a image/audio nesta rodada)', async () => {
      const { sut, aiProviderFactory, mediaDownloader } = buildSutWithMediaDownloader();

      await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        [
          buildImageMessage({
            id: 'm-doc',
            contentType: 'document',
            media: {
              mimeType: 'application/pdf',
              url: 'https://x.enc',
              mediaKeyEncrypted: 'enc:1',
            },
          }),
        ],
        PROMPT_VERSION,
        SESSION_NAME,
      );

      expect(mediaDownloader.downloadCalls).toEqual([]);
      expect(aiProviderFactory.provider.generateReplyCalls[0].messages[0].media).toBeUndefined();
    });

    it('falha na chamada ao MediaDownloader (lança): degrada graciosamente, resposta continua bem-sucedida', async () => {
      const { sut, mediaDownloader } = buildSutWithMediaDownloader();
      mediaDownloader.download = async () => {
        throw new Error('falha simulada');
      };

      const result = await sut.generateReply(
        TENANT_ID,
        CONVERSATION_ID,
        [buildImageMessage()],
        PROMPT_VERSION,
        SESSION_NAME,
      );

      expect(result.status).toBe('success');
    });
  });
});
