import { MessageIngestionService } from '../../../src/services/conversations/application/MessageIngestionService';
import { InboundWhatsAppMessage } from '../../../src/services/whatsapp/domain/handlers/MessageReceivedHandler';
import {
  FakeConversationRepository,
  FakeMessageRepository,
  FakeAiReplyScheduler,
  FakeAiAvailabilityRepository,
  FakeAiRateLimiter,
  FakeContactResolver,
  FakeOptOutDetector,
  FakeCampaignReplyTracker,
} from './testDoubles';
import { FakeTenantPlanRepository } from './FakeTenantPlanRepository';

function buildSut(): {
  sut: MessageIngestionService;
  conversationRepository: FakeConversationRepository;
  messageRepository: FakeMessageRepository;
  aiReplyScheduler: FakeAiReplyScheduler;
  aiAvailabilityRepository: FakeAiAvailabilityRepository;
  aiRateLimiter: FakeAiRateLimiter;
  contactResolver: FakeContactResolver;
  optOutDetector: FakeOptOutDetector;
  tenantPlanRepository: FakeTenantPlanRepository;
  campaignReplyTracker: FakeCampaignReplyTracker;
} {
  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();
  const aiReplyScheduler = new FakeAiReplyScheduler();
  const aiAvailabilityRepository = new FakeAiAvailabilityRepository();
  const aiRateLimiter = new FakeAiRateLimiter();
  const contactResolver = new FakeContactResolver();
  const optOutDetector = new FakeOptOutDetector();
  // Trava de plano (Lançamento suave/2026-08-31) — default `'pro'`, ver
  // `FakeTenantPlanRepository`.
  const tenantPlanRepository = new FakeTenantPlanRepository();
  const campaignReplyTracker = new FakeCampaignReplyTracker();
  const sut = new MessageIngestionService(
    conversationRepository,
    messageRepository,
    aiReplyScheduler,
    aiAvailabilityRepository,
    aiRateLimiter,
    contactResolver,
    optOutDetector,
    tenantPlanRepository,
    undefined,
    campaignReplyTracker,
  );
  return {
    sut,
    conversationRepository,
    messageRepository,
    aiReplyScheduler,
    aiAvailabilityRepository,
    aiRateLimiter,
    contactResolver,
    optOutDetector,
    tenantPlanRepository,
    campaignReplyTracker,
  };
}

function buildInboundMessage(
  overrides: Partial<InboundWhatsAppMessage> = {},
): InboundWhatsAppMessage {
  return {
    tenantId: 'tenant-1',
    sessionName: 'default',
    from: '5511999999999@s.whatsapp.net',
    content: 'Olá, preciso de ajuda',
    receivedAt: new Date('2026-07-10T12:00:00.000Z'),
    ...overrides,
  };
}

describe('MessageIngestionService', () => {
  describe('conversa', () => {
    it('cria uma nova conversa em modo bot na primeira mensagem de um contato', async () => {
      const { sut, conversationRepository } = buildSut();

      await sut.handle(buildInboundMessage());

      const conversations = conversationRepository.getAll();
      expect(conversations).toHaveLength(1);
      expect(conversations[0]).toMatchObject({
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        status: 'bot',
      });
    });

    it('reaproveita a mesma conversa em mensagens subsequentes do mesmo contato', async () => {
      const { sut, conversationRepository } = buildSut();

      await sut.handle(buildInboundMessage({ content: 'primeira' }));
      await sut.handle(buildInboundMessage({ content: 'segunda' }));

      expect(conversationRepository.getAll()).toHaveLength(1);
    });

    it('cria conversas distintas para contatos diferentes do mesmo tenant/sessão', async () => {
      const { sut, conversationRepository } = buildSut();

      await sut.handle(buildInboundMessage({ from: 'contato-a@s.whatsapp.net' }));
      await sut.handle(buildInboundMessage({ from: 'contato-b@s.whatsapp.net' }));

      expect(conversationRepository.getAll()).toHaveLength(2);
    });

    it('salva contactName (pushName) na conversa quando o evento traz um (Milestone 6, Bloco M6H-2b)', async () => {
      const { sut, conversationRepository } = buildSut();

      await sut.handle(buildInboundMessage({ contactName: 'Maria Silva' }));

      expect(conversationRepository.getAll()[0]).toMatchObject({ contactName: 'Maria Silva' });
    });

    it('atualiza contactName numa mensagem seguinte, mas NÃO apaga o nome já salvo quando a mensagem seguinte não traz nome', async () => {
      const { sut, conversationRepository } = buildSut();

      await sut.handle(buildInboundMessage({ content: 'primeira', contactName: 'Maria Silva' }));
      await sut.handle(buildInboundMessage({ content: 'segunda', contactName: undefined }));

      expect(conversationRepository.getAll()).toHaveLength(1);
      expect(conversationRepository.getAll()[0]).toMatchObject({ contactName: 'Maria Silva' });
    });
  });

  describe('indicador de não lidas (unreadCount, 2026-07-25)', () => {
    it('incrementa unreadCount a cada mensagem inbound', async () => {
      const { sut, conversationRepository } = buildSut();

      await sut.handle(buildInboundMessage({ content: 'primeira' }));
      await sut.handle(buildInboundMessage({ content: 'segunda' }));
      await sut.handle(buildInboundMessage({ content: 'terceira' }));

      expect(conversationRepository.getAll()[0].unreadCount).toBe(3);
    });

    it('conversas de contatos diferentes têm contadores independentes', async () => {
      const { sut, conversationRepository } = buildSut();

      await sut.handle(buildInboundMessage({ from: 'contato-a@s.whatsapp.net' }));
      await sut.handle(buildInboundMessage({ from: 'contato-a@s.whatsapp.net' }));
      await sut.handle(buildInboundMessage({ from: 'contato-b@s.whatsapp.net' }));

      const all = conversationRepository.getAll();
      expect(all.find((c) => c.contactJid === 'contato-a@s.whatsapp.net')?.unreadCount).toBe(2);
      expect(all.find((c) => c.contactJid === 'contato-b@s.whatsapp.net')?.unreadCount).toBe(1);
    });

    it('uma falha ao incrementar unreadCount não impede o resto do fluxo (agendamento da IA)', async () => {
      const { sut, conversationRepository, aiReplyScheduler } = buildSut();
      const spy = jest
        .spyOn(conversationRepository, 'incrementUnreadCount')
        .mockRejectedValueOnce(new Error('falha simulada'));

      await expect(sut.handle(buildInboundMessage())).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalled();
      expect(aiReplyScheduler.scheduleCalls).toHaveLength(1);
    });
  });

  describe('mensagem', () => {
    it('persiste a mensagem inbound associada à conversa correta', async () => {
      const { sut, conversationRepository, messageRepository } = buildSut();

      await sut.handle(buildInboundMessage({ content: 'Olá, preciso de ajuda' }));

      const [conversation] = conversationRepository.getAll();
      const messages = messageRepository.getAll();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        tenantId: 'tenant-1',
        conversationId: conversation.id,
        direction: 'inbound',
        content: 'Olá, preciso de ajuda',
        occurredAt: new Date('2026-07-10T12:00:00.000Z'),
      });
    });
  });

  describe('agendamento de resposta de IA', () => {
    it('agenda uma resposta de IA quando a conversa está em modo bot', async () => {
      const { sut, conversationRepository, messageRepository, aiReplyScheduler } = buildSut();

      await sut.handle(buildInboundMessage());

      const [conversation] = conversationRepository.getAll();
      const [message] = messageRepository.getAll();
      expect(aiReplyScheduler.scheduleCalls).toEqual([
        { tenantId: 'tenant-1', conversationId: conversation.id, messageId: message.id },
      ]);
    });

    it('NÃO agenda resposta de IA quando um humano está atendendo a conversa (com dono)', async () => {
      const { sut, conversationRepository, aiReplyScheduler } = buildSut();
      conversationRepository.seed({
        id: 'conversation-escalated',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        status: 'human',
        assignedToUserId: 'user-atendente',
        createdAt: new Date('2026-07-09T00:00:00.000Z'),
        updatedAt: new Date('2026-07-09T00:00:00.000Z'),
      });

      await sut.handle(buildInboundMessage());

      expect(aiReplyScheduler.scheduleCalls).toHaveLength(0);
    });

    it('mesmo sem agendar IA, ainda assim persiste a mensagem de uma conversa atendida por humano', async () => {
      const { sut, conversationRepository, messageRepository } = buildSut();
      conversationRepository.seed({
        id: 'conversation-escalated',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        status: 'human',
        assignedToUserId: 'user-atendente',
        createdAt: new Date('2026-07-09T00:00:00.000Z'),
        updatedAt: new Date('2026-07-09T00:00:00.000Z'),
      });

      await sut.handle(buildInboundMessage());

      expect(messageRepository.getAll()).toHaveLength(1);
    });

    it('propaga uma falha de AiReplyScheduler.schedule() (não engole o erro)', async () => {
      const { sut, aiReplyScheduler } = buildSut();
      aiReplyScheduler.failNextSchedule = true;

      await expect(sut.handle(buildInboundMessage())).rejects.toThrow(
        'Falha simulada no AiReplyScheduler',
      );
    });

    // Fase 1 (2026-08-07) — Botão POWER.
    describe('Botão POWER (aiEnabled da sessão)', () => {
      it('POWER OFF: NÃO agenda resposta de IA, mesmo com a conversa em modo bot', async () => {
        const { sut, aiReplyScheduler, aiAvailabilityRepository } = buildSut();
        aiAvailabilityRepository.setEnabled('tenant-1', 'default', false);

        await sut.handle(buildInboundMessage());

        expect(aiReplyScheduler.scheduleCalls).toHaveLength(0);
      });

      it('POWER OFF: a mensagem é persistida e a conversa é criada/atualizada normalmente (não é modo somente-leitura)', async () => {
        const { sut, conversationRepository, messageRepository, aiAvailabilityRepository } =
          buildSut();
        aiAvailabilityRepository.setEnabled('tenant-1', 'default', false);

        await sut.handle(buildInboundMessage());

        expect(conversationRepository.getAll()).toHaveLength(1);
        expect(messageRepository.getAll()).toHaveLength(1);
      });

      it('POWER OFF: mensagens não se acumulam para a IA responder depois — religar não reprocessa nada, porque nunca foi enfileirado', async () => {
        const { sut, aiReplyScheduler, aiAvailabilityRepository } = buildSut();
        aiAvailabilityRepository.setEnabled('tenant-1', 'default', false);

        await sut.handle(buildInboundMessage({ content: 'primeira, com a IA desligada' }));
        await sut.handle(buildInboundMessage({ content: 'segunda, ainda desligada' }));
        expect(aiReplyScheduler.scheduleCalls).toHaveLength(0);

        // Religou: só a PRÓXIMA mensagem (nova) é agendada — nada do que já
        // chegou enquanto estava desligada é reprocessado retroativamente.
        aiAvailabilityRepository.setEnabled('tenant-1', 'default', true);
        await sut.handle(buildInboundMessage({ content: 'terceira, já religada' }));

        expect(aiReplyScheduler.scheduleCalls).toHaveLength(1);
      });

      it('POWER ON (default, sessão nunca configurada): agenda resposta normalmente', async () => {
        const { sut, aiReplyScheduler } = buildSut();

        await sut.handle(buildInboundMessage());

        expect(aiReplyScheduler.scheduleCalls).toHaveLength(1);
      });

      it('checa o toggle pelo (tenantId, sessionName) da MENSAGEM recebida, não de outra sessão', async () => {
        const { sut, aiReplyScheduler, aiAvailabilityRepository } = buildSut();
        aiAvailabilityRepository.setEnabled('tenant-1', 'outra-sessao', false);

        await sut.handle(buildInboundMessage({ sessionName: 'default' }));

        expect(aiReplyScheduler.scheduleCalls).toHaveLength(1);
      });
    });

    // Lançamento suave (2026-08-31) — Trava de plano.
    describe('Trava de plano (Tenant.plan)', () => {
      it('Plano Grátis: NÃO agenda resposta de IA, mesmo com a conversa em modo bot e a IA da sessão ligada', async () => {
        const { sut, aiReplyScheduler, tenantPlanRepository } = buildSut();
        tenantPlanRepository.setPlan('free');

        await sut.handle(buildInboundMessage());

        expect(aiReplyScheduler.scheduleCalls).toHaveLength(0);
      });

      it('Plano Grátis: a mensagem é persistida e a conversa criada normalmente (só-leitura, não perde a mensagem)', async () => {
        const { sut, conversationRepository, messageRepository, tenantPlanRepository } = buildSut();
        tenantPlanRepository.setPlan('free');

        await sut.handle(buildInboundMessage());

        expect(conversationRepository.getAll()).toHaveLength(1);
        expect(messageRepository.getAll()).toHaveLength(1);
      });

      it('Plano Pro (default do fake): agenda resposta normalmente', async () => {
        const { sut, aiReplyScheduler } = buildSut();

        await sut.handle(buildInboundMessage());

        expect(aiReplyScheduler.scheduleCalls).toHaveLength(1);
      });

      it('Plano Enterprise: agenda resposta normalmente', async () => {
        const { sut, aiReplyScheduler, tenantPlanRepository } = buildSut();
        tenantPlanRepository.setPlan('enterprise');

        await sut.handle(buildInboundMessage());

        expect(aiReplyScheduler.scheduleCalls).toHaveLength(1);
      });
    });
  });

  describe('reativação do bot após silêncio (aguardando humano sem dono)', () => {
    function seedWaitingConversation(conversationRepository: FakeConversationRepository): void {
      conversationRepository.seed({
        id: 'conversation-waiting',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        status: 'human',
        // sem assignedToUserId — escalada mas ninguém assumiu (fila de espera).
        createdAt: new Date('2026-07-10T10:00:00.000Z'),
        updatedAt: new Date('2026-07-10T10:00:00.000Z'),
      });
    }

    it('reassume no bot e agenda IA quando a última atividade foi há >= 30 min', async () => {
      const { sut, conversationRepository, messageRepository, aiReplyScheduler } = buildSut();
      seedWaitingConversation(conversationRepository);
      // Última mensagem 31 min antes da nova (silêncio > 30 min).
      await messageRepository.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-waiting',
        direction: 'outbound',
        content: 'Já estou te encaminhando para um atendente.',
        contentType: 'text',
        occurredAt: new Date('2026-07-10T11:29:00.000Z'),
      });

      await sut.handle(buildInboundMessage({ receivedAt: new Date('2026-07-10T12:00:00.000Z') }));

      // Voltou para o bot e a IA foi agendada.
      const conversation = await conversationRepository.findById('conversation-waiting');
      expect(conversation?.status).toBe('bot');
      expect(conversation?.assignedToUserId).toBeUndefined();
      expect(aiReplyScheduler.scheduleCalls).toHaveLength(1);
      expect(aiReplyScheduler.scheduleCalls[0].conversationId).toBe('conversation-waiting');
    });

    it('NÃO reassume (segue aguardando humano) quando o silêncio foi menor que 30 min', async () => {
      const { sut, conversationRepository, messageRepository, aiReplyScheduler } = buildSut();
      seedWaitingConversation(conversationRepository);
      // Última mensagem só 15 min antes da nova (silêncio < 30 min).
      await messageRepository.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-waiting',
        direction: 'outbound',
        content: 'Já estou te encaminhando para um atendente.',
        contentType: 'text',
        occurredAt: new Date('2026-07-10T11:45:00.000Z'),
      });

      await sut.handle(buildInboundMessage({ receivedAt: new Date('2026-07-10T12:00:00.000Z') }));

      const conversation = await conversationRepository.findById('conversation-waiting');
      expect(conversation?.status).toBe('human');
      expect(aiReplyScheduler.scheduleCalls).toHaveLength(0);
    });

    it('NÃO reassume uma conversa que um humano assumiu (com dono), mesmo após muito silêncio', async () => {
      const { sut, conversationRepository, messageRepository, aiReplyScheduler } = buildSut();
      conversationRepository.seed({
        id: 'conversation-owned',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        status: 'human',
        assignedToUserId: 'user-atendente',
        createdAt: new Date('2026-07-09T00:00:00.000Z'),
        updatedAt: new Date('2026-07-09T00:00:00.000Z'),
      });
      await messageRepository.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-owned',
        direction: 'inbound',
        content: 'mensagem antiga',
        contentType: 'text',
        occurredAt: new Date('2026-07-09T00:00:00.000Z'),
      });

      await sut.handle(buildInboundMessage({ receivedAt: new Date('2026-07-10T12:00:00.000Z') }));

      const conversation = await conversationRepository.findById('conversation-owned');
      expect(conversation?.status).toBe('human');
      expect(aiReplyScheduler.scheduleCalls).toHaveLength(0);
    });
  });

  // ADR #97 — mensagens enviadas pelo operador de outro dispositivo (WhatsApp
  // mobile/web) chegam com direction='outbound'. Devem ser persistidas para
  // espelhar o histórico real, mas NÃO devem acionar IA, incrementar unreadCount
  // nem reativar o bot.
  describe('mensagens outbound (operador enviou de outro dispositivo, ADR #97)', () => {
    it('persiste a mensagem com direction=outbound', async () => {
      const { sut, messageRepository } = buildSut();

      await sut.handle(
        buildInboundMessage({ direction: 'outbound', content: 'Boa tarde, cliente!' }),
      );

      const [msg] = messageRepository.getAll();
      expect(msg.direction).toBe('outbound');
      expect(msg.content).toBe('Boa tarde, cliente!');
    });

    it('NÃO agenda resposta de IA para mensagem outbound', async () => {
      const { sut, aiReplyScheduler } = buildSut();

      await sut.handle(buildInboundMessage({ direction: 'outbound' }));

      expect(aiReplyScheduler.scheduleCalls).toHaveLength(0);
    });

    it('NÃO incrementa unreadCount para mensagem outbound', async () => {
      const { sut, conversationRepository } = buildSut();

      await sut.handle(buildInboundMessage({ direction: 'outbound' }));

      // A conversa é criada normalmente, mas o contador de não lidas permanece 0.
      expect(conversationRepository.getAll()[0].unreadCount).toBe(0);
    });

    it('cria/atualiza conversa normalmente (usa from = remoteJid do contato)', async () => {
      const { sut, conversationRepository } = buildSut();

      await sut.handle(
        buildInboundMessage({ direction: 'outbound', from: '5511888888888@s.whatsapp.net' }),
      );

      const conversations = conversationRepository.getAll();
      expect(conversations).toHaveLength(1);
      expect(conversations[0].contactJid).toBe('5511888888888@s.whatsapp.net');
    });

    it('omite contactName para mensagem outbound — pushName seria o nome do operador', async () => {
      const { sut, conversationRepository } = buildSut();

      await sut.handle(
        buildInboundMessage({
          direction: 'outbound',
          // contactName aqui seria o nome do operador — deve ser ignorado.
          contactName: 'Wesley Francis',
        }),
      );

      // A conversa é criada sem nome (contactName undefined na criação).
      expect(conversationRepository.getAll()[0].contactName).toBeUndefined();
    });

    it('NÃO reativa o bot em conversa aguardando humano quando o operador envia do celular', async () => {
      const { sut, conversationRepository, aiReplyScheduler } = buildSut();
      // Conversa aguardando humano sem dono, há muito tempo sem atividade.
      conversationRepository.seed({
        id: 'conversation-waiting',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        status: 'human',
        unreadCount: 0,
        stage: 'new',
        stageSetBy: 'ai',
        stageUpdatedAt: new Date(),
        excludedFromPipeline: false,
        tags: [],
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        assignedToUserId: undefined, // sem dono = "aguardando"
      });

      // Operador envia mensagem do celular 2 horas depois (> 30 min de silêncio).
      await sut.handle(
        buildInboundMessage({
          direction: 'outbound',
          receivedAt: new Date('2026-07-10T12:00:00.000Z'),
        }),
      );

      // Bot NÃO deve ser reativado — o operador já está respondendo pelo celular.
      const conversation = conversationRepository
        .getAll()
        .find((c) => c.id === 'conversation-waiting');
      expect(conversation?.status).toBe('human');
      expect(aiReplyScheduler.scheduleCalls).toHaveLength(0);
    });

    it('undefined direction é tratado como inbound (compatibilidade com emissores anteriores à ADR #97)', async () => {
      const { sut, messageRepository, aiReplyScheduler } = buildSut();

      await sut.handle(buildInboundMessage({ direction: undefined }));

      expect(messageRepository.getAll()[0].direction).toBe('inbound');
      expect(aiReplyScheduler.scheduleCalls).toHaveLength(1);
    });
  });

  describe('rate limit de IA (Fase 1, Bloco F1.10)', () => {
    it('dentro do limite: agenda a resposta de IA normalmente', async () => {
      const { sut, aiReplyScheduler, aiRateLimiter } = buildSut();

      await sut.handle(buildInboundMessage());

      expect(aiReplyScheduler.scheduleCalls).toHaveLength(1);
      expect(aiRateLimiter.calls).toEqual([
        { tenantId: 'tenant-1', sessionName: 'default', conversationId: expect.any(String) },
      ]);
    });

    it('limite estourado: NÃO agenda resposta de IA e sinaliza atenção humana (mesmo mecanismo de falha de IA)', async () => {
      const { sut, aiReplyScheduler, aiRateLimiter, conversationRepository } = buildSut();
      aiRateLimiter.setBlocked(true);

      await sut.handle(buildInboundMessage());

      expect(aiReplyScheduler.scheduleCalls).toHaveLength(0);
      const conversation = conversationRepository.getAll()[0];
      expect(conversation.escalatedAt).toBeInstanceOf(Date);
    });

    it('limite estourado: a mensagem ainda é persistida normalmente (fica visível na Dashboard)', async () => {
      const { sut, messageRepository, aiRateLimiter } = buildSut();
      aiRateLimiter.setBlocked(true);

      await sut.handle(buildInboundMessage({ content: 'mensagem numa rajada' }));

      expect(messageRepository.getAll()).toHaveLength(1);
      expect(messageRepository.getAll()[0].content).toBe('mensagem numa rajada');
    });

    it('mensagem outbound (operador de outro dispositivo) nunca consulta o rate limiter', async () => {
      const { sut, aiRateLimiter } = buildSut();

      await sut.handle(buildInboundMessage({ direction: 'outbound' }));

      expect(aiRateLimiter.calls).toHaveLength(0);
    });

    it('Botão POWER desligado: nem chega a consultar o rate limiter (shouldAutoRespond já bloqueou antes)', async () => {
      const { sut, aiAvailabilityRepository, aiRateLimiter } = buildSut();
      aiAvailabilityRepository.setEnabled('tenant-1', 'default', false);

      await sut.handle(buildInboundMessage());

      expect(aiRateLimiter.calls).toHaveLength(0);
    });
  });

  // Fase L, Bloco L1 — identidade durável da pessoa por trás da conversa.
  describe('identidade de contato', () => {
    it('resolve e vincula o contato na primeira mensagem de uma conversa nova', async () => {
      const { sut, conversationRepository, contactResolver } = buildSut();
      contactResolver.setContactId('contato-abc');

      await sut.handle(buildInboundMessage());

      const [conversation] = conversationRepository.getAll();
      expect(conversation.contactId).toBe('contato-abc');
      expect(contactResolver.calls).toEqual([
        { tenantId: 'tenant-1', contactJid: '5511999999999@s.whatsapp.net' },
      ]);
    });

    it('não reconsulta o resolver quando a conversa já está vinculada', async () => {
      const { sut, contactResolver } = buildSut();

      await sut.handle(buildInboundMessage());
      await sut.handle(buildInboundMessage({ content: 'segunda mensagem' }));

      expect(contactResolver.calls).toHaveLength(1);
    });

    // Um LID não contém telefone algum: 13 de 51 conversas da base real.
    // A conversa precisa funcionar normalmente, só sem contato associado.
    it('segue sem vínculo quando o endereço não tem identidade resolvível', async () => {
      const { sut, conversationRepository, messageRepository } = buildSut();

      await sut.handle(buildInboundMessage({ from: '225236742053984@lid' }));

      const [conversation] = conversationRepository.getAll();
      expect(conversation.contactId).toBeUndefined();
      // O que importa: a mensagem foi recebida do mesmo jeito.
      expect(messageRepository.getAll()).toHaveLength(1);
    });

    it('vincula também a partir de mensagem outbound (o operador escreveu primeiro pelo celular)', async () => {
      const { sut, conversationRepository } = buildSut();

      await sut.handle(buildInboundMessage({ direction: 'outbound' }));

      const [conversation] = conversationRepository.getAll();
      expect(conversation.contactId).toBe('contact-1');
    });

    // O vínculo é auxiliar: jamais pode impedir uma mensagem de cliente de
    // ser recebida, nem a IA de responder.
    it('uma falha ao vincular não interrompe a ingestão nem o agendamento da IA', async () => {
      const { sut, conversationRepository, messageRepository, aiReplyScheduler } = buildSut();
      jest
        .spyOn(conversationRepository, 'linkContact')
        .mockRejectedValue(new Error('falha simulada de banco'));

      await expect(sut.handle(buildInboundMessage())).resolves.toBeUndefined();

      expect(messageRepository.getAll()).toHaveLength(1);
      expect(aiReplyScheduler.scheduleCalls).toHaveLength(1);
    });
  });

  // Fase L, Bloco L2 — opt-out automático por palavra-chave.
  describe('opt-out automático', () => {
    it('aciona o detector com o contactId resolvido e o conteúdo da mensagem', async () => {
      const { sut, optOutDetector } = buildSut();

      await sut.handle(buildInboundMessage({ content: 'PARAR' }));

      expect(optOutDetector.calls).toEqual([
        { tenantId: 'tenant-1', contactId: 'contact-1', content: 'PARAR' },
      ]);
    });

    it('aciona o detector mesmo quando o contato já estava vinculado (não só na primeira mensagem)', async () => {
      const { sut, optOutDetector } = buildSut();

      await sut.handle(buildInboundMessage({ content: 'Olá' }));
      await sut.handle(buildInboundMessage({ content: 'PARAR' }));

      expect(optOutDetector.calls).toHaveLength(2);
    });

    it('NÃO aciona o detector para mensagem outbound (operador de outro dispositivo)', async () => {
      const { sut, optOutDetector } = buildSut();

      await sut.handle(buildInboundMessage({ content: 'PARAR', direction: 'outbound' }));

      expect(optOutDetector.calls).toHaveLength(0);
    });

    it('NÃO aciona o detector quando não há identidade resolvível (ex.: LID)', async () => {
      const { sut, optOutDetector, contactResolver } = buildSut();
      contactResolver.setUnresolvable();

      await sut.handle(buildInboundMessage({ content: 'PARAR', from: '225236742053984@lid' }));

      expect(optOutDetector.calls).toHaveLength(0);
    });

    // O detector nunca lança (mesmo contrato de ContactResolver), então este
    // teste só confirma que a ingestão não precisa de try/catch ao redor dele.
    it('a chamada ao detector não interrompe o restante da ingestão', async () => {
      const { sut, messageRepository, aiReplyScheduler } = buildSut();

      await sut.handle(buildInboundMessage({ content: 'PARAR' }));

      expect(messageRepository.getAll()).toHaveLength(1);
      expect(aiReplyScheduler.scheduleCalls).toHaveLength(1);
    });
  });

  describe('resposta a campanha (Fase L, Bloco L6)', () => {
    it('aciona o tracker com o conversationId a cada mensagem INBOUND', async () => {
      const { sut, campaignReplyTracker, conversationRepository } = buildSut();

      await sut.handle(buildInboundMessage({ content: 'Oi, recebi sua mensagem' }));

      const [conversation] = conversationRepository.getAll();
      expect(campaignReplyTracker.calls).toEqual([
        { tenantId: 'tenant-1', conversationId: conversation.id },
      ]);
    });

    it('NÃO aciona o tracker para mensagem outbound (operador de outro dispositivo)', async () => {
      const { sut, campaignReplyTracker } = buildSut();

      await sut.handle(buildInboundMessage({ direction: 'outbound' }));

      expect(campaignReplyTracker.calls).toHaveLength(0);
    });

    it('sem tracker configurado (modo degradado): a ingestão segue normalmente', async () => {
      const conversationRepository = new FakeConversationRepository();
      const messageRepository = new FakeMessageRepository();
      const aiReplyScheduler = new FakeAiReplyScheduler();
      const aiAvailabilityRepository = new FakeAiAvailabilityRepository();
      const aiRateLimiter = new FakeAiRateLimiter();
      const contactResolver = new FakeContactResolver();
      const optOutDetector = new FakeOptOutDetector();
      const tenantPlanRepository = new FakeTenantPlanRepository();
      const sutWithoutTracker = new MessageIngestionService(
        conversationRepository,
        messageRepository,
        aiReplyScheduler,
        aiAvailabilityRepository,
        aiRateLimiter,
        contactResolver,
        optOutDetector,
        tenantPlanRepository,
      ); // sem `campaignReplyTracker`

      await expect(sutWithoutTracker.handle(buildInboundMessage())).resolves.toBeUndefined();
      expect(messageRepository.getAll()).toHaveLength(1);
    });

    it('setCampaignReplyTracker() liga o vínculo depois da construção (injeção tardia)', async () => {
      const conversationRepository = new FakeConversationRepository();
      const messageRepository = new FakeMessageRepository();
      const aiReplyScheduler = new FakeAiReplyScheduler();
      const aiAvailabilityRepository = new FakeAiAvailabilityRepository();
      const aiRateLimiter = new FakeAiRateLimiter();
      const contactResolver = new FakeContactResolver();
      const optOutDetector = new FakeOptOutDetector();
      const tenantPlanRepository = new FakeTenantPlanRepository();
      const sutLateWired = new MessageIngestionService(
        conversationRepository,
        messageRepository,
        aiReplyScheduler,
        aiAvailabilityRepository,
        aiRateLimiter,
        contactResolver,
        optOutDetector,
        tenantPlanRepository,
      );
      const lateTracker = new FakeCampaignReplyTracker();
      sutLateWired.setCampaignReplyTracker(lateTracker);

      await sutLateWired.handle(buildInboundMessage());

      expect(lateTracker.calls).toHaveLength(1);
    });
  });
});
