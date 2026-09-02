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
import { FakeAiBusinessProfileRepository } from './infrastructure/FakeAiBusinessProfileRepository';
import { FakeAiPreferencesRepository } from './infrastructure/FakeAiPreferencesRepository';
import { FakeOutboundMessageDispatcher } from '../whatsapp/infrastructure/FakeOutboundMessageDispatcher';
import { FakeTenantPlanRepository } from '../conversations/FakeTenantPlanRepository';
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
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: new Date('2026-07-10T12:00:00Z'),
    excludedFromPipeline: false,
    archived: false,
    tags: [],
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
    // Fase 1, Bloco F1.1 (ADR #90): campo novo obrigatório — todas as
    // mensagens deste arquivo de teste são texto (comportamento pré-F1.1).
    contentType: 'text',
    ...overrides,
  };
}

function buildSut(
  historyLimit?: number,
  options: {
    now?: () => Date;
    handoffNoticeRepeatAfterMs?: number;
    // Cérebro da IA v3, Fase 3 (2026-08-26).
    aiPreferencesRepository?: FakeAiPreferencesRepository;
  } = {},
): {
  processor: AiReplyJobProcessor;
  conversationRepository: FakeConversationRepository;
  messageRepository: FakeMessageRepository;
  aiProviderFactory: FakeAiProviderFactory;
  aiInteractionRepository: FakeAiInteractionRepository;
  outboundDispatcher: FakeOutboundMessageDispatcher;
  aiBusinessProfileRepository: FakeAiBusinessProfileRepository;
  tenantPlanRepository: FakeTenantPlanRepository;
} {
  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();
  const aiProviderFactory = new FakeAiProviderFactory();
  const aiInteractionRepository = new FakeAiInteractionRepository();
  const outboundDispatcher = new FakeOutboundMessageDispatcher();
  const aiBusinessProfileRepository = new FakeAiBusinessProfileRepository();
  // Trava de plano (Lançamento suave/2026-08-31) — default `'pro'`, ver
  // `FakeTenantPlanRepository`.
  const tenantPlanRepository = new FakeTenantPlanRepository();
  const conversationAiService = new ConversationAiService(
    aiProviderFactory,
    'claude',
    new PromptBuilder(),
    aiInteractionRepository,
  );
  // Onda 3 do redesign (2026-08-24) — `paragraphDelayMs`/`sleepFn` saíram
  // desta classe: a pausa entre parágrafos agora vive em
  // `OutboundCommandConsumer` (que envia cada item de `content: string[]`
  // sequencialmente), não mais aqui — esta classe despacha um ÚNICO comando
  // por resposta, sem nenhum sleep próprio.
  const processor =
    historyLimit === undefined
      ? new AiReplyJobProcessor(
          conversationRepository,
          messageRepository,
          conversationAiService,
          outboundDispatcher,
          PROMPT_VERSION,
          new NoopLogger(),
          aiBusinessProfileRepository,
          tenantPlanRepository,
          undefined,
          undefined,
          options.handoffNoticeRepeatAfterMs,
          options.now,
          undefined,
          options.aiPreferencesRepository,
        )
      : new AiReplyJobProcessor(
          conversationRepository,
          messageRepository,
          conversationAiService,
          outboundDispatcher,
          PROMPT_VERSION,
          new NoopLogger(),
          aiBusinessProfileRepository,
          tenantPlanRepository,
          historyLimit,
          undefined,
          options.handoffNoticeRepeatAfterMs,
          options.now,
          undefined,
          options.aiPreferencesRepository,
        );

  return {
    processor,
    conversationRepository,
    messageRepository,
    aiProviderFactory,
    aiInteractionRepository,
    outboundDispatcher,
    aiBusinessProfileRepository,
    tenantPlanRepository,
  };
}

describe('AiReplyJobProcessor', () => {
  describe('process() — caminho de sucesso', () => {
    it('busca o histórico, inverte para ordem cronológica e repassa ao ConversationAiService', async () => {
      const { processor, conversationRepository, messageRepository, aiProviderFactory } =
        buildSut();
      conversationRepository.seed(buildConversation());
      await messageRepository.create(
        buildMessage({
          id: 'm1',
          content: 'primeira mensagem',
          occurredAt: new Date('2026-07-10T12:00:00Z'),
        }),
      );
      await messageRepository.create(
        buildMessage({
          id: 'm2',
          content: 'segunda mensagem',
          occurredAt: new Date('2026-07-10T12:01:00Z'),
        }),
      );
      aiProviderFactory.provider.setNextResult({
        content: 'resposta',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData());

      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(1);
      expect(aiProviderFactory.provider.generateReplyCalls[0].messages).toEqual([
        { role: 'user', content: 'primeira mensagem' },
        { role: 'user', content: 'segunda mensagem' },
      ]);
    });

    /**
     * Pedido do fundador (2026-08-24) — achado real: um cliente sumiu e
     * voltou dias depois, e a IA respondeu como se fosse a continuação
     * direta da conversa antiga. `trimHistoryToCurrentSession` corta o
     * histórico na última sessão ativa (gap >= 24h) antes de repassar à IA
     * — este teste prova a fiação ponta a ponta (não só a função pura, já
     * coberta em `trimHistoryToCurrentSession.test.ts`).
     */
    it('corta mensagens de mais de 24h atrás antes de repassar à IA (cliente voltou dias depois)', async () => {
      const { processor, conversationRepository, messageRepository, aiProviderFactory } =
        buildSut();
      conversationRepository.seed(buildConversation());
      await messageRepository.create(
        buildMessage({
          id: 'antiga-1',
          content: 'pergunta de uma conversa de dias atrás',
          occurredAt: new Date('2026-07-10T12:00:00Z'),
        }),
      );
      await messageRepository.create(
        buildMessage({
          id: 'antiga-2',
          direction: 'outbound',
          content: 'resposta antiga da IA',
          occurredAt: new Date('2026-07-10T12:01:00Z'),
        }),
      );
      // Gap de 2 dias — bem acima do limite de 24h.
      await messageRepository.create(
        buildMessage({
          id: 'message-inbound-1',
          content: 'oi, voltei',
          occurredAt: new Date('2026-07-12T12:00:00Z'),
        }),
      );
      aiProviderFactory.provider.setNextResult({
        content: 'resposta',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData());

      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(1);
      expect(aiProviderFactory.provider.generateReplyCalls[0].messages).toEqual([
        { role: 'user', content: 'oi, voltei' },
      ]);
    });

    it('despacha via OutboundMessageDispatcher com aiInteractionId/content corretos quando a geração é bem-sucedida', async () => {
      const {
        processor,
        conversationRepository,
        aiProviderFactory,
        aiInteractionRepository,
        outboundDispatcher,
      } = buildSut();
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
          content: ['Olá, tudo bem?'],
        },
      ]);
    });

    it('respeita o historyLimit configurado (mensagens mais antigas além do limite são descartadas)', async () => {
      const { processor, conversationRepository, messageRepository, aiProviderFactory } =
        buildSut(1);
      conversationRepository.seed(buildConversation());
      await messageRepository.create(
        buildMessage({
          id: 'm1',
          content: 'mais antiga',
          occurredAt: new Date('2026-07-10T12:00:00Z'),
        }),
      );
      await messageRepository.create(
        buildMessage({
          id: 'm2',
          content: 'mais recente',
          occurredAt: new Date('2026-07-10T12:01:00Z'),
        }),
      );

      await processor.process(buildJobData());

      expect(aiProviderFactory.provider.generateReplyCalls[0].messages).toEqual([
        { role: 'user', content: 'mais recente' },
      ]);
    });

    it('Fase 1, Bloco F1.4: propaga data.messageId (mensagem inbound do job) até o AiInteraction persistido', async () => {
      const { processor, conversationRepository, aiProviderFactory, aiInteractionRepository } =
        buildSut();
      conversationRepository.seed(buildConversation());
      aiProviderFactory.provider.setNextResult({
        content: 'Corte custa R$ 50.',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData({ messageId: 'message-inbound-xyz' }));

      const [recorded] = aiInteractionRepository.getAll();
      expect(recorded.messageId).toBe('message-inbound-xyz');
      expect(recorded.escalationReason).toBeUndefined();
    });
  });

  describe('process() — divisão em parágrafos (Fase 1, 2026-08-07: um parágrafo por mensagem)', () => {
    /**
     * Onda 3 do redesign (2026-08-24) — CORREÇÃO ESTRUTURAL de um bug real
     * medido em produção ("o último balão vira o primeiro"): antes desta
     * rodada, cada parágrafo virava um `dispatch()`/job INDEPENDENTE (com
     * `idempotencyKey` `<id>-p1`/`<id>-p2` e um sleep entre cada um). Medido
     * contra o Redis real que isso causava uma corrida entre os jobs da
     * MESMA rajada — ver docstring de `OutboundMessageCommand.content`. Um
     * único `dispatch()` agora carrega TODOS os parágrafos
     * (`content: string[]`); é `OutboundCommandConsumer` quem envia cada um
     * sequencialmente, dentro da MESMA execução — sem mais jobs concorrentes
     * por resposta, então sem mais corrida possível. Os testes antigos que
     * verificavam N dispatches/pausas/idempotencyKeys por parágrafo (`-p1`/
     * `-p2`, contagem de `sleepFn`) deixaram de fazer sentido para esta
     * classe — a pausa entre parágrafos agora é testada em
     * `OutboundCommandConsumer.test.ts`.
     */
    it('resposta com vários parágrafos: UM único dispatch carregando todos, na ordem, com aiInteractionId', async () => {
      const {
        processor,
        conversationRepository,
        aiProviderFactory,
        aiInteractionRepository,
        outboundDispatcher,
      } = buildSut();
      conversationRepository.seed(buildConversation());
      aiProviderFactory.provider.setNextResult({
        content: 'Oi! Tudo bem?\nO valor do serviço é R$ 150.\nPosso agendar para você?',
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
          content: ['Oi! Tudo bem?', 'O valor do serviço é R$ 150.', 'Posso agendar para você?'],
        },
      ]);
    });

    it('resposta de um parágrafo só: dispatch com array de um item', async () => {
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } =
        buildSut();
      conversationRepository.seed(buildConversation());
      aiProviderFactory.provider.setNextResult({
        content: 'Corte custa R$ 50.',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData());

      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
      expect(outboundDispatcher.dispatchCalls[0].content).toEqual(['Corte custa R$ 50.']);
    });
  });

  describe('process() — auto-escalonamento (N2, reformado em 2026-07-25)', () => {
    it('IA emite o marcador: envia a mensagem SEM o marcador e SINALIZA escalatedAt, sem mudar status (a IA continua respondendo)', async () => {
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } =
        buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiProviderFactory.provider.setNextResult({
        content: 'Vou te encaminhar para um atendente. [[ESCALAR_HUMANO:NAO_SEI]]',
        model: 'claude-x',
        tokensInput: 5,
        tokensOutput: 5,
      });

      await processor.process(buildJobData());

      // A mensagem enviada NÃO contém o marcador.
      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
      expect(outboundDispatcher.dispatchCalls[0].content).toEqual([
        'Vou te encaminhar para um atendente.',
      ]);
      // A conversa continua em 'bot' — só sinalizada como precisando de atenção.
      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.status).toBe('bot');
      expect(updated?.assignedToUserId).toBeUndefined();
      expect(updated?.escalatedAt).toBeInstanceOf(Date);
    });

    it('Fase 1, Bloco F1.4: marcador PEDIU_ATENDENTE grava escalationReason=requested_human no AiInteraction persistido', async () => {
      const { processor, conversationRepository, aiProviderFactory, aiInteractionRepository } =
        buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiProviderFactory.provider.setNextResult({
        content: 'Já vou te encaminhar. [[ESCALAR_HUMANO:PEDIU_ATENDENTE]]',
        model: 'claude-x',
        tokensInput: 5,
        tokensOutput: 5,
      });

      await processor.process(buildJobData({ messageId: 'message-pediu-1' }));

      const [recorded] = aiInteractionRepository.getAll();
      expect(recorded.escalationReason).toBe('requested_human');
      expect(recorded.messageId).toBe('message-pediu-1');
    });

    it('uma SEGUNDA escalada na mesma conversa reescreve escalatedAt (sustenta um novo alerta na Dashboard)', async () => {
      const { processor, conversationRepository, aiProviderFactory } = buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiProviderFactory.provider.setNextResult({
        content: 'Primeira vez que não sei responder. [[ESCALAR_HUMANO:NAO_SEI]]',
        model: 'claude-x',
        tokensInput: 5,
        tokensOutput: 5,
      });
      await processor.process(buildJobData({ messageId: 'message-1' }));
      const firstEscalatedAt = (await conversationRepository.findById(CONVERSATION_ID))
        ?.escalatedAt;

      await new Promise((resolve) => setTimeout(resolve, 5));
      aiProviderFactory.provider.setNextResult({
        content: 'De novo não sei responder. [[ESCALAR_HUMANO:NAO_SEI]]',
        model: 'claude-x',
        tokensInput: 5,
        tokensOutput: 5,
      });
      await processor.process(buildJobData({ messageId: 'message-2' }));
      const secondEscalatedAt = (await conversationRepository.findById(CONVERSATION_ID))
        ?.escalatedAt;

      expect(secondEscalatedAt?.getTime()).toBeGreaterThan(firstEscalatedAt?.getTime() ?? 0);
    });

    it('resposta normal (sem marcador): NÃO mexe no status nem em escalatedAt da conversa', async () => {
      const { processor, conversationRepository, aiProviderFactory } = buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiProviderFactory.provider.setNextResult({
        content: 'Corte custa R$ 50.',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData());

      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.status).toBe('bot');
      expect(updated?.escalatedAt).toBeUndefined();
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
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } =
        buildSut();
      conversationRepository.seed(buildConversation({ status: 'human' }));

      await processor.process(buildJobData());

      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(0);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
    });

    // Fase 1 (2026-08-07) — Botão POWER: defesa em profundidade, o job pode
    // ter sido enfileirado ANTES de a IA ser desligada.
    it('Botão POWER desligado DEPOIS do job já enfileirado: não gera resposta nem despacha na re-checagem', async () => {
      const {
        processor,
        conversationRepository,
        aiProviderFactory,
        outboundDispatcher,
        aiBusinessProfileRepository,
      } = buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiBusinessProfileRepository.seed(TENANT_ID, 'default', '', { aiEnabled: false });

      await processor.process(buildJobData());

      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(0);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
    });

    it('Botão POWER ligado (default, sem perfil configurado): gera e despacha normalmente', async () => {
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } =
        buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiProviderFactory.provider.setNextResult({
        content: 'ok',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData());

      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(1);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
    });

    // Lançamento suave (2026-08-31) — Trava de plano: defesa em profundidade,
    // o tenant pode ter sido rebaixado para o Plano Grátis DEPOIS que o job
    // já estava na fila.
    it('tenant rebaixado para o Plano Grátis DEPOIS do job enfileirado: não gera resposta nem despacha na re-checagem', async () => {
      const {
        processor,
        conversationRepository,
        aiProviderFactory,
        outboundDispatcher,
        tenantPlanRepository,
      } = buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      tenantPlanRepository.setPlan('free');

      await processor.process(buildJobData());

      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(0);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
    });
  });

  // Agrupamento de rajada (2026-08-14). O mecanismo tem duas metades: o
  // `delay` no enfileiramento (BullMqAiReplyScheduler) e a policy
  // `shouldGenerateReply` aplicada aqui. Estes testes cobrem a segunda.
  describe('process() — agrupamento de mensagens em rajada', () => {
    /**
     * `FakeMessageRepository.create()` atribui o `id` (espelhando o
     * repositório real, cuja assinatura é `Omit<Message, 'id'>`) — então o
     * `id` passado em `buildMessage` é descartado. Por isso os ids REAIS são
     * devolvidos aqui: é deles que o `messageId` do job precisa sair, senão a
     * policy cai no caminho de degradação segura ("mensagem fora da janela")
     * e o teste passaria por engano.
     */
    async function seedBurst(
      messageRepository: FakeMessageRepository,
    ): Promise<{ first: string; last: string }> {
      const first = await messageRepository.create(
        buildMessage({
          id: 'ignorado',
          content: 'Oi',
          occurredAt: new Date('2026-07-10T12:00:00Z'),
        }),
      );
      await messageRepository.create(
        buildMessage({
          id: 'ignorado',
          content: 'queria saber uma coisa',
          occurredAt: new Date('2026-07-10T12:00:03Z'),
        }),
      );
      const last = await messageRepository.create(
        buildMessage({
          id: 'ignorado',
          content: 'vocês parcelam?',
          occurredAt: new Date('2026-07-10T12:00:06Z'),
        }),
      );

      return { first: first.id, last: last.id };
    }

    it('job de um fragmento ANTERIOR da rajada encerra sem chamar o provider nem despachar', async () => {
      const {
        processor,
        conversationRepository,
        messageRepository,
        aiProviderFactory,
        outboundDispatcher,
      } = buildSut();
      conversationRepository.seed(buildConversation());
      const { first } = await seedBurst(messageRepository);

      await processor.process(buildJobData({ messageId: first }));

      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(0);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
    });

    it('job da mensagem MAIS RECENTE responde uma única vez, com a rajada inteira no histórico', async () => {
      const {
        processor,
        conversationRepository,
        messageRepository,
        aiProviderFactory,
        outboundDispatcher,
      } = buildSut();
      conversationRepository.seed(buildConversation());
      const { last } = await seedBurst(messageRepository);
      aiProviderFactory.provider.setNextResult({
        content: 'Sim, parcelamos em até 3x.',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData({ messageId: last }));

      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(1);
      expect(aiProviderFactory.provider.generateReplyCalls[0].messages).toEqual([
        { role: 'user', content: 'Oi' },
        { role: 'user', content: 'queria saber uma coisa' },
        { role: 'user', content: 'vocês parcelam?' },
      ]);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
    });

    // Este é o caso que o desenho anterior (dedup por `jobId` de conversa)
    // PERDIA em silêncio: a mensagem chegava enquanto o job estava `active`,
    // o `add()` era descartado, e ela nunca recebia resposta.
    it('mensagem que chega DEPOIS de a rajada ter sido respondida é atendida normalmente', async () => {
      const {
        processor,
        conversationRepository,
        messageRepository,
        aiProviderFactory,
        outboundDispatcher,
      } = buildSut();
      conversationRepository.seed(buildConversation());
      const { last } = await seedBurst(messageRepository);
      aiProviderFactory.provider.setNextResult({
        content: 'Sim, parcelamos em até 3x.',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });
      await processor.process(buildJobData({ messageId: last }));

      // A resposta da IA é persistida pelo consumidor da fila outbound; aqui
      // o efeito equivalente é registrá-la no histórico antes da pergunta nova.
      await messageRepository.create(
        buildMessage({
          id: 'ignorado',
          direction: 'outbound',
          content: 'Sim, parcelamos em até 3x.',
          occurredAt: new Date('2026-07-10T12:00:09Z'),
        }),
      );
      const novaPergunta = await messageRepository.create(
        buildMessage({
          id: 'ignorado',
          content: 'e no cartão?',
          occurredAt: new Date('2026-07-10T12:00:12Z'),
        }),
      );
      aiProviderFactory.provider.setNextResult({
        content: 'No cartão também.',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData({ messageId: novaPergunta.id }));

      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(2);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(2);
    });
  });

  describe('process() — válvula de segurança contra loop de automação (pedido do fundador, 2026-08-27)', () => {
    /**
     * Semeia 3 trocas rápidas (<3s) com conteúdo repetido — o padrão que
     * `detectAutomatedLoop` reconhece como bot-vs-bot. Devolve o `id` real da
     * última mensagem inbound, necessário para `shouldGenerateReply` deixar o
     * job seguir adiante até a checagem de loop.
     */
    async function seedFastRepetitiveExchanges(
      messageRepository: FakeMessageRepository,
    ): Promise<string> {
      const REPEATED = 'Recebemos sua mensagem, retornaremos em breve.';
      let lastInboundId = '';
      let t = 0;
      for (let i = 0; i < 3; i += 1) {
        await messageRepository.create(
          buildMessage({
            id: 'ignorado',
            direction: 'outbound',
            content: REPEATED,
            occurredAt: new Date(1_752_000_000_000 + t * 1000),
          }),
        );
        t += 1; // 1s depois — bem abaixo do limiar de 3s
        const inbound = await messageRepository.create(
          buildMessage({
            id: 'ignorado',
            direction: 'inbound',
            content: REPEATED,
            occurredAt: new Date(1_752_000_000_000 + t * 1000),
          }),
        );
        lastInboundId = inbound.id;
        t += 10;
      }
      return lastInboundId;
    }

    it('detecta o padrão (ritmo rápido + conteúdo repetido) e encerra SEM chamar a IA nem enviar nada ao cliente', async () => {
      const {
        processor,
        conversationRepository,
        messageRepository,
        aiProviderFactory,
        outboundDispatcher,
      } = buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      const lastInboundId = await seedFastRepetitiveExchanges(messageRepository);

      await processor.process(buildJobData({ messageId: lastInboundId }));

      // Nem uma chamada de IA, nem uma mensagem enviada — nenhum custo de
      // Gemini, e nenhum "aviso de encaminhamento" desperdiçado num robô.
      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(0);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);

      // Mas a conversa É sinalizada internamente, para um humano revisar.
      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.escalatedAt).toBeInstanceOf(Date);
      expect(updated?.status).toBe('bot'); // não tira a IA do circuito, mesmo racional dos demais gatilhos
    });

    it('conversa rápida mas SEM repetição de conteúdo continua respondendo normalmente (não é falso positivo)', async () => {
      const { processor, conversationRepository, messageRepository, aiProviderFactory, outboundDispatcher } =
        buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      let t = 0;
      let lastInboundId = '';
      const perguntas = ['Quero saber o preço', 'Vocês têm entrega?', 'Fecho o pedido então'];
      for (const pergunta of perguntas) {
        await messageRepository.create(
          buildMessage({
            id: 'ignorado',
            direction: 'outbound',
            content: 'Claro, já te respondo!',
            occurredAt: new Date(1_752_000_000_000 + t * 1000),
          }),
        );
        t += 1;
        const inbound = await messageRepository.create(
          buildMessage({
            id: 'ignorado',
            direction: 'inbound',
            content: pergunta,
            occurredAt: new Date(1_752_000_000_000 + t * 1000),
          }),
        );
        lastInboundId = inbound.id;
        t += 10;
      }
      aiProviderFactory.provider.setNextResult({
        content: 'Resposta normal.',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData({ messageId: lastInboundId }));

      expect(aiProviderFactory.provider.generateReplyCalls).toHaveLength(1);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.escalatedAt).toBeUndefined();
    });
  });

  describe('process() — resultado não enviável avisa o cliente e sinaliza para humano (sem tirar a IA do circuito)', () => {
    it('validation_rejected (resposta vazia): envia aviso educado ao cliente, grava o AiInteraction e sinaliza escalatedAt, sem mudar status', async () => {
      const {
        processor,
        conversationRepository,
        aiProviderFactory,
        aiInteractionRepository,
        outboundDispatcher,
      } = buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiProviderFactory.provider.setNextResult({
        content: '   ',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData());

      // Em vez de silêncio, o cliente recebe um aviso de encaminhamento.
      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
      expect(outboundDispatcher.dispatchCalls[0].content[0]).toContain('encaminhando');
      // A mensagem do sistema usa idempotencyKey (não aiInteractionId).
      expect(outboundDispatcher.dispatchCalls[0].idempotencyKey).toBeDefined();
      expect(outboundDispatcher.dispatchCalls[0].aiInteractionId).toBeUndefined();
      expect(aiInteractionRepository.getAll()).toHaveLength(1);
      expect(aiInteractionRepository.getAll()[0].status).toBe('validation_rejected');
      // A conversa continua em 'bot' — só sinalizada (aguardando atendente).
      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.status).toBe('bot');
      expect(updated?.assignedToUserId).toBeUndefined();
      expect(updated?.escalatedAt).toBeInstanceOf(Date);
    });

    it('Cérebro da IA v3, Fase 3: usa a mensagem customizada da SESSÃO quando configurada', async () => {
      const aiPreferencesRepository = new FakeAiPreferencesRepository();
      aiPreferencesRepository.seed(TENANT_ID, 'default', {
        customHandoffMessage: 'Segura aí que já te chamo um humano! 🙌',
      });
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } = buildSut(
        undefined,
        { aiPreferencesRepository },
      );
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiProviderFactory.provider.setNextResult({
        content: '   ',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData());

      expect(outboundDispatcher.dispatchCalls[0].content[0]).toBe(
        'Segura aí que já te chamo um humano! 🙌',
      );
    });

    it('Cérebro da IA v3, Fase 3: sem preferências configuradas para a sessão, usa o texto padrão', async () => {
      const aiPreferencesRepository = new FakeAiPreferencesRepository(); // vazio
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } = buildSut(
        undefined,
        { aiPreferencesRepository },
      );
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiProviderFactory.provider.setNextResult({
        content: '   ',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData());

      expect(outboundDispatcher.dispatchCalls[0].content[0]).toContain('encaminhando');
    });

    it('Cérebro da IA v3, Fase 3: degrada graciosamente quando a leitura de preferências falha (usa o texto padrão)', async () => {
      const aiPreferencesRepository = new FakeAiPreferencesRepository();
      aiPreferencesRepository.failNextFind();
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } = buildSut(
        undefined,
        { aiPreferencesRepository },
      );
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiProviderFactory.provider.setNextResult({
        content: '   ',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData());

      expect(outboundDispatcher.dispatchCalls[0].content[0]).toContain('encaminhando');
    });

    it('provider_error (ex.: cota esgotada): envia aviso educado ao cliente, grava o AiInteraction e sinaliza escalatedAt, sem mudar status', async () => {
      const {
        processor,
        conversationRepository,
        aiProviderFactory,
        aiInteractionRepository,
        outboundDispatcher,
      } = buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiProviderFactory.provider.setNextError(
        new Error('Gemini API respondeu 429: RESOURCE_EXHAUSTED'),
      );

      await processor.process(buildJobData());

      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
      expect(outboundDispatcher.dispatchCalls[0].content[0]).toContain('encaminhando');
      expect(aiInteractionRepository.getAll()).toHaveLength(1);
      expect(aiInteractionRepository.getAll()[0].status).toBe('provider_error');
      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.status).toBe('bot');
      expect(updated?.assignedToUserId).toBeUndefined();
      expect(updated?.escalatedAt).toBeInstanceOf(Date);
    });

    it('NÃO repete o aviso ao cliente quando a conversa foi escalada RECENTEMENTE (bug real: mesma desculpa várias vezes seguidas)', async () => {
      // CORREÇÃO 2026-08-18: `now` fixo, 1h depois de `escalatedAt` — dentro
      // da janela padrão de 6h (`DEFAULT_HANDOFF_NOTICE_REPEAT_AFTER_MS`),
      // então a supressão ainda vale.
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } = buildSut(
        undefined,
        { now: () => new Date('2026-08-14T20:00:00Z') },
      );
      // Conversa que JÁ pediu ajuda humana e ninguém assumiu — `escalatedAt`
      // preenchido é exatamente o registro de "o cliente já foi avisado".
      conversationRepository.seed(
        buildConversation({ status: 'bot', escalatedAt: new Date('2026-08-14T19:00:00Z') }),
      );
      aiProviderFactory.provider.setNextError(
        new Error('Gemini API respondeu 429: RESOURCE_EXHAUSTED'),
      );

      await processor.process(buildJobData());

      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
    });

    it('VOLTA a avisar o cliente quando a última escalada foi há mais que a janela (achado real: cliente esquecido numa escalada de 11 dias)', async () => {
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } = buildSut(
        undefined,
        { now: () => new Date('2026-08-15T02:00:00Z') },
      ); // 7h depois — passou da janela de 6h.
      conversationRepository.seed(
        buildConversation({ status: 'bot', escalatedAt: new Date('2026-08-14T19:00:00Z') }),
      );
      aiProviderFactory.provider.setNextError(
        new Error('Gemini API respondeu 429: RESOURCE_EXHAUSTED'),
      );

      await processor.process(buildJobData());

      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
      expect(outboundDispatcher.dispatchCalls[0].content[0]).toContain('encaminhando');
    });

    it('respeita uma janela customizada (handoffNoticeRepeatAfterMs)', async () => {
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } = buildSut(
        undefined,
        {
          now: () => new Date('2026-08-14T19:05:00Z'), // 5 min depois
          handoffNoticeRepeatAfterMs: 60_000, // janela de só 1 min
        },
      );
      conversationRepository.seed(
        buildConversation({ status: 'bot', escalatedAt: new Date('2026-08-14T19:00:00Z') }),
      );
      aiProviderFactory.provider.setNextError(
        new Error('Gemini API respondeu 429: RESOURCE_EXHAUSTED'),
      );

      await processor.process(buildJobData());

      // 5 minutos já passou da janela customizada de 1 minuto — avisa de novo.
      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
    });

    it('mesmo suprimindo o aviso, continua sinalizando para humano (o alerta da Dashboard não pode sumir)', async () => {
      const { processor, conversationRepository, aiProviderFactory } = buildSut();
      const escaladaAnterior = new Date('2026-08-14T19:00:00Z');
      conversationRepository.seed(
        buildConversation({ status: 'bot', escalatedAt: escaladaAnterior }),
      );
      aiProviderFactory.provider.setNextError(
        new Error('Gemini API respondeu 429: RESOURCE_EXHAUSTED'),
      );

      await processor.process(buildJobData());

      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.escalatedAt).toBeInstanceOf(Date);
      expect(updated?.escalatedAt?.getTime()).toBeGreaterThan(escaladaAnterior.getTime());
    });

    it('se o envio do aviso falhar, ainda sinaliza para humano (não bloqueia)', async () => {
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } =
        buildSut();
      conversationRepository.seed(buildConversation({ status: 'bot' }));
      aiProviderFactory.provider.setNextResult({
        content: '   ',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });
      outboundDispatcher.failNextDispatch = true;

      await expect(processor.process(buildJobData())).resolves.toBeUndefined();

      // O envio do aviso falhou, mas a conversa foi sinalizada mesmo assim.
      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.status).toBe('bot');
      expect(updated?.assignedToUserId).toBeUndefined();
      expect(updated?.escalatedAt).toBeInstanceOf(Date);
    });
  });

  describe('process() — pipeline de CRM: classificação de estágio (Milestone 6, Bloco M6H-5)', () => {
    it('IA inclui o marcador de estágio: envia a mensagem SEM o marcador e grava o novo stage com stageSetBy "ai"', async () => {
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } =
        buildSut();
      conversationRepository.seed(buildConversation({ stage: 'new', stageSetBy: 'ai' }));
      aiProviderFactory.provider.setNextResult({
        content: 'Legal, qual seria o melhor horário pra você? [[ESTAGIO:NEGOTIATING]]',
        model: 'claude-x',
        tokensInput: 5,
        tokensOutput: 5,
      });

      await processor.process(buildJobData());

      expect(outboundDispatcher.dispatchCalls[0].content).toEqual([
        'Legal, qual seria o melhor horário pra você?',
      ]);
      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.stage).toBe('negotiating');
      expect(updated?.stageSetBy).toBe('ai');
    });

    it('ADR #89: conversa já corrigida por humano NÃO trava mais a IA — o avanço é gravado normalmente', async () => {
      const { processor, conversationRepository, aiProviderFactory } = buildSut();
      conversationRepository.seed(buildConversation({ stage: 'contacted', stageSetBy: 'human' }));
      aiProviderFactory.provider.setNextResult({
        content: 'Fechado! [[ESTAGIO:CLOSED_WON]]',
        model: 'claude-x',
        tokensInput: 5,
        tokensOutput: 5,
      });

      await processor.process(buildJobData());

      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.stage).toBe('closed_won');
      expect(updated?.stageSetBy).toBe('ai');
    });

    it('ADR #89: a IA NUNCA regride um card — marcador de estágio anterior é ignorado', async () => {
      const { processor, conversationRepository, aiProviderFactory } = buildSut();
      conversationRepository.seed(buildConversation({ stage: 'closed_won', stageSetBy: 'human' }));
      aiProviderFactory.provider.setNextResult({
        content: 'Quando podemos começar? [[ESTAGIO:NEGOTIATING]]',
        model: 'claude-x',
        tokensInput: 5,
        tokensOutput: 5,
      });

      await processor.process(buildJobData());

      // Protege a correção humana sobre PROGRESSO: um negócio marcado como
      // fechado não volta para "negociando" porque o cliente seguiu falando.
      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.stage).toBe('closed_won');
      expect(updated?.stageSetBy).toBe('human');
    });

    /**
     * Pedido do fundador (2026-08-24) — quando a sessão reinicia (gap >=
     * 24h), a regra "só para frente" do teste acima NÃO se aplica: a IA
     * classificou lendo só a mensagem nova, sem nenhuma pista da conversa
     * antiga, então mesmo uma REGRESSÃO (aqui, de "negotiating" para "new")
     * é uma classificação legítima, não um erro de leitura — ver docstring
     * de `shouldAiUpdateStage`.
     */
    it('EXCEÇÃO à regra "só para frente": sessão reiniciada (24h+) libera a IA a regredir o estágio', async () => {
      const { processor, conversationRepository, messageRepository, aiProviderFactory } =
        buildSut();
      conversationRepository.seed(buildConversation({ stage: 'negotiating', stageSetBy: 'ai' }));
      await messageRepository.create(
        buildMessage({
          id: 'antiga-1',
          content: 'pergunta sobre o orçamento de dias atrás',
          occurredAt: new Date('2026-07-10T12:00:00Z'),
        }),
      );
      // Gap de 2 dias — sessão reiniciada.
      await messageRepository.create(
        buildMessage({
          id: 'message-inbound-1',
          content: 'oi, quero saber sobre outro assunto',
          occurredAt: new Date('2026-07-12T12:00:00Z'),
        }),
      );
      aiProviderFactory.provider.setNextResult({
        content: 'Oi! Tudo bem? Me conta, o que você precisa? [[ESTAGIO:NEW]]',
        model: 'claude-x',
        tokensInput: 5,
        tokensOutput: 5,
      });

      await processor.process(buildJobData());

      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.stage).toBe('new');
      expect(updated?.stageSetBy).toBe('ai');
    });

    it('resposta sem marcador de estágio: nao mexe no stage atual', async () => {
      const { processor, conversationRepository, aiProviderFactory } = buildSut();
      conversationRepository.seed(buildConversation({ stage: 'contacted', stageSetBy: 'ai' }));
      aiProviderFactory.provider.setNextResult({
        content: 'Corte custa R$ 50.',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData());

      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.stage).toBe('contacted');
    });

    it('resultado não enviável (validation_rejected/provider_error): nao tenta atualizar o stage', async () => {
      const { processor, conversationRepository, aiProviderFactory } = buildSut();
      conversationRepository.seed(buildConversation({ stage: 'new', stageSetBy: 'ai' }));
      aiProviderFactory.provider.setNextResult({
        content: '   ',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });

      await processor.process(buildJobData());

      const updated = await conversationRepository.findById(CONVERSATION_ID);
      expect(updated?.stage).toBe('new');
    });
  });

  describe('process() — falha do OutboundMessageDispatcher', () => {
    it('propaga a falha (não engole) — deixa o BullMQ retentar o job ai-reply', async () => {
      const { processor, conversationRepository, aiProviderFactory, outboundDispatcher } =
        buildSut();
      conversationRepository.seed(buildConversation());
      aiProviderFactory.provider.setNextResult({
        content: 'ok',
        model: 'claude-x',
        tokensInput: 1,
        tokensOutput: 1,
      });
      outboundDispatcher.failNextDispatch = true;

      await expect(processor.process(buildJobData())).rejects.toThrow(
        'Falha simulada no OutboundMessageDispatcher',
      );
    });
  });
});
