import { ConversationsService } from '../../../src/services/conversations/application/ConversationsService';
import { TenantNotFoundError } from '../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { ConversationNotFoundError } from '../../../src/services/conversations/domain/errors/ConversationNotFoundError';
import { Conversation } from '../../../src/services/conversations/domain/entities/Conversation';
import { ConversationOwnershipError } from '../../../src/services/conversations/domain/errors/ConversationOwnershipError';
import { ConversationNotHumanError } from '../../../src/services/conversations/domain/errors/ConversationNotHumanError';
import { AgentReplyRequiresPaidPlanError } from '../../../src/services/conversations/domain/errors/AgentReplyRequiresPaidPlanError';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../shared/tenant/FakeTenantRepository';
import { FakeAuditLogRepository } from '../auth/testDoubles';
import {
  FakeConversationRepository,
  FakeMessageRepository,
  FakeContactResolver,
} from './testDoubles';
import { ConversationContactUnavailableError } from '../../../src/services/conversations/domain/errors/ConversationContactUnavailableError';
import { FakeOutboundMessageDispatcher } from '../whatsapp/infrastructure/FakeOutboundMessageDispatcher';
import { FakeMediaDownloader } from '../whatsapp/infrastructure/FakeMediaDownloader';
import { FakeMediaSender } from '../whatsapp/infrastructure/FakeMediaSender';
import { MessageMediaNotFoundError } from '../../../src/services/conversations/domain/errors/MessageMediaNotFoundError';
import { AgentMediaTooLargeError } from '../../../src/services/conversations/domain/errors/AgentMediaTooLargeError';
import { AgentMediaTypeMismatchError } from '../../../src/services/conversations/domain/errors/AgentMediaTypeMismatchError';
import { Message } from '../../../src/services/conversations/domain/entities/Message';

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
    archived: false,
    tags: [],
    createdAt: new Date('2026-07-10T12:00:00Z'),
    updatedAt: new Date('2026-07-10T12:00:00Z'),
    ...overrides,
  };
}

function buildMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'message-1',
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    direction: 'inbound',
    content: '',
    contentType: 'text',
    occurredAt: new Date('2026-07-31T12:00:00Z'),
    ...overrides,
  };
}

function buildService(): {
  service: ConversationsService;
  conversationRepository: FakeConversationRepository;
  messageRepository: FakeMessageRepository;
  tenantRepository: FakeTenantRepository;
  auditLogRepository: FakeAuditLogRepository;
  outboundDispatcher: FakeOutboundMessageDispatcher;
  mediaDownloader: FakeMediaDownloader;
  mediaSender: FakeMediaSender;
  contactResolver: FakeContactResolver;
} {
  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();
  const tenantRepository = new FakeTenantRepository();
  const auditLogRepository = new FakeAuditLogRepository();
  const outboundDispatcher = new FakeOutboundMessageDispatcher();
  const mediaDownloader = new FakeMediaDownloader();
  const mediaSender = new FakeMediaSender();
  const contactResolver = new FakeContactResolver();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: 'hash-qualquer' });
  const service = new ConversationsService(
    conversationRepository,
    messageRepository,
    tenantRepository,
    auditLogRepository,
    new NoopLogger(),
    outboundDispatcher,
    mediaDownloader,
    mediaSender,
    undefined,
    contactResolver,
  );
  return {
    service,
    conversationRepository,
    messageRepository,
    tenantRepository,
    auditLogRepository,
    outboundDispatcher,
    mediaDownloader,
    mediaSender,
    contactResolver,
  };
}

describe('ConversationsService', () => {
  describe('getConversation() (Fase 1, Bloco F1.10)', () => {
    it('devolve a conversa quando ela existe e pertence ao tenant', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ id: 'c-1', tenantId: 'tenant-1' }));

      const result = await service.getConversation('tenant-1', 'c-1');

      expect(result.id).toBe('c-1');
      expect(result.tenantId).toBe('tenant-1');
    });

    it('lança ConversationNotFoundError quando a conversa não existe', async () => {
      const { service } = buildService();

      await expect(service.getConversation('tenant-1', 'inexistente')).rejects.toBeInstanceOf(
        ConversationNotFoundError,
      );
    });

    it('lança ConversationNotFoundError (nunca vaza dado) quando a conversa é de OUTRO tenant', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ id: 'c-1', tenantId: 'tenant-2' }));

      await expect(service.getConversation('tenant-1', 'c-1')).rejects.toBeInstanceOf(
        ConversationNotFoundError,
      );
    });

    it('lança TenantNotFoundError quando o tenant informado não existe', async () => {
      const { service } = buildService();

      await expect(service.getConversation('tenant-inexistente', 'c-1')).rejects.toBeInstanceOf(
        TenantNotFoundError,
      );
    });
  });

  describe('escalateConversation() / resumeConversation() (D10)', () => {
    it('escalateConversation() muda o status para "human" e devolve a conversa atualizada', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'bot' }));

      const result = await service.escalateConversation('tenant-1', 'conversation-1');

      expect(result.status).toBe('human');
    });

    it('resumeConversation() muda o status para "bot"', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human' }));

      const result = await service.resumeConversation('tenant-1', 'conversation-1');

      expect(result.status).toBe('bot');
    });

    it('e idempotente: escalonar uma conversa ja "human" nao lanca e mantem o status', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human' }));

      const result = await service.escalateConversation('tenant-1', 'conversation-1');

      expect(result.status).toBe('human');
    });

    it('lanca ConversationNotFoundError quando a conversa nao existe', async () => {
      const { service } = buildService();

      await expect(
        service.escalateConversation('tenant-1', 'conversation-inexistente'),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('lanca ConversationNotFoundError (nao vaza a existencia do recurso) quando a conversa pertence a OUTRO tenant', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ tenantId: 'tenant-2' }));

      await expect(service.escalateConversation('tenant-1', 'conversation-1')).rejects.toThrow(
        ConversationNotFoundError,
      );
    });

    it('lanca TenantNotFoundError quando o tenant nao existe, ANTES de tocar o ConversationRepository', async () => {
      const { service, conversationRepository } = buildService();
      const updateStatusSpy = jest.spyOn(conversationRepository, 'updateStatus');

      await expect(
        service.escalateConversation('tenant-inexistente', 'conversation-1'),
      ).rejects.toThrow(TenantNotFoundError);
      expect(updateStatusSpy).not.toHaveBeenCalled();
    });

    it('escalateConversation() limpa escalatedAt (assumir a conversa encerra a sinalizacao de espera) - reforma do escalonamento, 2026-07-25', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(
        buildConversation({ status: 'bot', escalatedAt: new Date('2026-07-25T10:00:00Z') }),
      );
      const updateStatusSpy = jest.spyOn(conversationRepository, 'updateStatus');

      const result = await service.escalateConversation('tenant-1', 'conversation-1');

      expect(result.escalatedAt).toBeUndefined();
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'tenant-1',
        'conversation-1',
        'human',
        expect.objectContaining({ escalatedAt: null }),
      );
    });

    it('resumeConversation() tambem limpa escalatedAt - reforma do escalonamento, 2026-07-25', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(
        buildConversation({ status: 'human', escalatedAt: new Date('2026-07-25T10:00:00Z') }),
      );
      const updateStatusSpy = jest.spyOn(conversationRepository, 'updateStatus');

      const result = await service.resumeConversation('tenant-1', 'conversation-1');

      expect(result.escalatedAt).toBeUndefined();
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'tenant-1',
        'conversation-1',
        'bot',
        expect.objectContaining({ escalatedAt: null }),
      );
    });
  });

  describe('ownership + auditoria (Milestone 5, Bloco M5D / D57)', () => {
    const OP = { userId: 'op-1', canResumeAny: false };

    it('escalate GRAVA o dono (assignedToUserId = quem assumiu) e audita conversation.escalated', async () => {
      const { service, conversationRepository, auditLogRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'bot' }));

      const result = await service.escalateConversation('tenant-1', 'conversation-1', OP);

      expect(result.status).toBe('human');
      expect(result.assignedToUserId).toBe('op-1');
      expect(
        auditLogRepository
          .all()
          .some(
            (e) =>
              e.action === 'conversation.escalated' &&
              e.actorUserId === 'op-1' &&
              e.targetId === 'conversation-1',
          ),
      ).toBe(true);
    });

    it('resume LIMPA o dono e audita conversation.resumed', async () => {
      const { service, conversationRepository, auditLogRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-1' }));

      const result = await service.resumeConversation('tenant-1', 'conversation-1', OP);

      expect(result.status).toBe('bot');
      expect(result.assignedToUserId).toBeUndefined();
      expect(auditLogRepository.all().some((e) => e.action === 'conversation.resumed')).toBe(true);
    });

    it('Operator retoma a PROPRIA conversa (que ele assumiu)', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-1' }));

      const result = await service.resumeConversation('tenant-1', 'conversation-1', OP);

      expect(result.status).toBe('bot');
    });

    it('Operator NAO retoma conversa de OUTRO operador -> ConversationOwnershipError (403)', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-2' }));

      await expect(service.resumeConversation('tenant-1', 'conversation-1', OP)).rejects.toThrow(
        ConversationOwnershipError,
      );
    });

    it('Manager (canResumeAny) retoma a conversa de QUALQUER um', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-2' }));

      const result = await service.resumeConversation('tenant-1', 'conversation-1', {
        userId: 'mgr-1',
        canResumeAny: true,
      });

      expect(result.status).toBe('bot');
    });

    it('plano maquina (default) escala sem dono (assignedToUserId undefined) e audita sem ator', async () => {
      const { service, conversationRepository, auditLogRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'bot' }));

      const result = await service.escalateConversation('tenant-1', 'conversation-1');

      expect(result.assignedToUserId).toBeUndefined();
      expect(
        auditLogRepository
          .all()
          .some((e) => e.action === 'conversation.escalated' && e.actorUserId === undefined),
      ).toBe(true);
    });
  });

  describe('listConversations() (D11 - paginacao por cursor)', () => {
    it('aplica DEFAULT_LIST_LIMIT quando limit nao e informado', async () => {
      const { service, conversationRepository } = buildService();
      const findAllByTenantSpy = jest.spyOn(conversationRepository, 'findAllByTenant');
      conversationRepository.seed(buildConversation());

      await service.listConversations('tenant-1');

      expect(findAllByTenantSpy).toHaveBeenCalledWith('tenant-1', {
        status: undefined,
        limit: 50,
        cursor: undefined,
        // Menu "⋮" da conversa (2026-08-29) — listConversations() sempre
        // passa um boolean explícito ao repositório (default false).
        archived: false,
      });
    });

    it('nunca excede MAX_LIST_LIMIT mesmo se um limit maior for pedido', async () => {
      const { service, conversationRepository } = buildService();
      const findAllByTenantSpy = jest.spyOn(conversationRepository, 'findAllByTenant');

      await service.listConversations('tenant-1', { limit: 999999 });

      expect(findAllByTenantSpy).toHaveBeenCalledWith('tenant-1', {
        status: undefined,
        limit: 200,
        cursor: undefined,
        archived: false,
      });
    });

    it('repassa status/cursor ao repositorio quando informados', async () => {
      const { service, conversationRepository } = buildService();
      const findAllByTenantSpy = jest.spyOn(conversationRepository, 'findAllByTenant');

      await service.listConversations('tenant-1', {
        status: 'human',
        cursor: 'conversation-anterior',
        limit: 10,
      });

      expect(findAllByTenantSpy).toHaveBeenCalledWith('tenant-1', {
        status: 'human',
        limit: 10,
        cursor: 'conversation-anterior',
        archived: false,
      });
    });

    it('filtra por sessionName quando informado (Milestone 6, Bloco M6H-2)', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ id: 'c-vendas', sessionName: 'vendas' }));
      conversationRepository.seed(buildConversation({ id: 'c-suporte', sessionName: 'suporte' }));

      const page = await service.listConversations('tenant-1', { sessionName: 'vendas' });

      expect(page.conversations.map((c) => c.id)).toEqual(['c-vendas']);
    });

    it('ordena por updatedAt (atividade mais recente primeiro), nao por createdAt (pedido do fundador, 2026-07-25)', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(
        buildConversation({
          id: 'c-antiga-mas-ativa',
          createdAt: new Date('2026-07-01T00:00:00Z'),
          updatedAt: new Date('2026-07-25T16:29:00Z'),
        }),
      );
      conversationRepository.seed(
        buildConversation({
          id: 'c-nova-mas-parada',
          createdAt: new Date('2026-07-24T00:00:00Z'),
          updatedAt: new Date('2026-07-24T00:00:00Z'),
        }),
      );

      const page = await service.listConversations('tenant-1');

      // Criada por ultimo ("c-nova-mas-parada", 24/07) deveria vir primeiro
      // se a ordenacao fosse por createdAt — mas quem teve atividade mais
      // recente ("c-antiga-mas-ativa", mensagem as 16:29 de 25/07) e quem
      // deve aparecer no topo da inbox.
      expect(page.conversations.map((c) => c.id)).toEqual([
        'c-antiga-mas-ativa',
        'c-nova-mas-parada',
      ]);
    });

    it('lanca TenantNotFoundError quando o tenant nao existe', async () => {
      const { service } = buildService();

      await expect(service.listConversations('tenant-inexistente')).rejects.toThrow(
        TenantNotFoundError,
      );
    });
  });

  describe('listMessages() (D12 - reaproveita listRecentByConversation, inverte para ordem cronologica)', () => {
    it('devolve as mensagens em ordem cronologica (mais antiga primeiro), nao na ordem "mais recente primeiro" do repositorio', async () => {
      const { service, messageRepository } = buildService();
      await messageRepository.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'inbound',
        content: 'primeira',
        contentType: 'text',
        occurredAt: new Date('2026-07-10T12:00:00Z'),
      });
      await messageRepository.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'outbound',
        content: 'segunda',
        contentType: 'text',
        occurredAt: new Date('2026-07-10T12:01:00Z'),
      });

      const result = await service.listMessages('tenant-1', 'conversation-1');

      expect(result.map((m) => m.content)).toEqual(['primeira', 'segunda']);
    });

    it('nao lanca para uma conversa inexistente/de outro tenant - devolve lista vazia (mesmo padrao de getSessionHistory)', async () => {
      const { service } = buildService();

      const result = await service.listMessages('tenant-1', 'conversation-inexistente');

      expect(result).toEqual([]);
    });

    it('lanca TenantNotFoundError quando o tenant nao existe', async () => {
      const { service } = buildService();

      await expect(service.listMessages('tenant-inexistente', 'conversation-1')).rejects.toThrow(
        TenantNotFoundError,
      );
    });
  });

  describe('sendAgentMessage() (N2 - resposta do operador)', () => {
    const OP = { userId: 'op-1', canResumeAny: false };

    it('conversa "human" do proprio operador: despacha pela fila outbound (com idempotencyKey, sem aiInteractionId) e audita', async () => {
      const { service, conversationRepository, auditLogRepository, outboundDispatcher } =
        buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-1' }));

      await service.sendAgentMessage('tenant-1', 'conversation-1', 'Oi, posso ajudar!', OP);

      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
      const command = outboundDispatcher.dispatchCalls[0];
      expect(command).toMatchObject({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        content: ['Oi, posso ajudar!'],
      });
      expect(typeof command.idempotencyKey).toBe('string');
      expect(command.aiInteractionId).toBeUndefined();
      expect(
        auditLogRepository
          .all()
          .some((e) => e.action === 'conversation.agent_message' && e.actorUserId === 'op-1'),
      ).toBe(true);
    });

    it('conversa em "bot" (ninguem assumiu): lanca ConversationNotHumanError e NAO despacha', async () => {
      const { service, conversationRepository, outboundDispatcher } = buildService();
      conversationRepository.seed(buildConversation({ status: 'bot' }));

      await expect(
        service.sendAgentMessage('tenant-1', 'conversation-1', 'oi', OP),
      ).rejects.toThrow(ConversationNotHumanError);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
    });

    it('conversa inexistente/de outro tenant: ConversationNotFoundError', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', tenantId: 'tenant-2' }));

      await expect(
        service.sendAgentMessage('tenant-1', 'conversation-1', 'oi', OP),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('Operator tentando responder a conversa de OUTRO: ConversationOwnershipError e NAO despacha', async () => {
      const { service, conversationRepository, outboundDispatcher } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-2' }));

      await expect(
        service.sendAgentMessage('tenant-1', 'conversation-1', 'oi', OP),
      ).rejects.toThrow(ConversationOwnershipError);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
    });

    it('Manager (canResumeAny) responde a conversa de qualquer um', async () => {
      const { service, conversationRepository, outboundDispatcher } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-2' }));

      await service.sendAgentMessage('tenant-1', 'conversation-1', 'oi', {
        userId: 'mgr-1',
        canResumeAny: true,
      });

      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
    });

    it('lanca TenantNotFoundError quando o tenant nao existe', async () => {
      const { service } = buildService();

      await expect(
        service.sendAgentMessage('tenant-inexistente', 'conversation-1', 'oi', OP),
      ).rejects.toThrow(TenantNotFoundError);
    });

    it('sem dispatcher configurado: recusa com erro claro', async () => {
      const conversationRepository = new FakeConversationRepository();
      const tenantRepository = new FakeTenantRepository();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa', apiKeyHash: 'h' });
      conversationRepository.seed(buildConversation({ status: 'human' }));
      const serviceSemDispatcher = new ConversationsService(
        conversationRepository,
        new FakeMessageRepository(),
        tenantRepository,
        new FakeAuditLogRepository(),
        new NoopLogger(),
      );

      await expect(
        serviceSemDispatcher.sendAgentMessage('tenant-1', 'conversation-1', 'oi'),
      ).rejects.toThrow(/OutboundMessageDispatcher não configurado/);
    });
  });

  describe('Trava de plano (T2, Lançamento suave 2026-08-31)', () => {
    const OP = { userId: 'op-1', canResumeAny: false };
    const MEDIA = {
      contentType: 'image' as const,
      buffer: Buffer.from('bytes-da-imagem'),
      mimeType: 'image/jpeg',
      caption: 'foto',
    };

    it('tenant free: sendAgentMessage recusa com AgentReplyRequiresPaidPlanError e NÃO despacha', async () => {
      const { service, conversationRepository, tenantRepository, outboundDispatcher } =
        buildService();
      tenantRepository.seed({ id: 'tenant-1', name: 'Grátis', apiKeyHash: 'h', plan: 'free' });
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-1' }));

      await expect(
        service.sendAgentMessage('tenant-1', 'conversation-1', 'oi', OP),
      ).rejects.toThrow(AgentReplyRequiresPaidPlanError);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
    });

    it('tenant free: sendAgentMediaMessage recusa com AgentReplyRequiresPaidPlanError e NÃO chama o MediaSender', async () => {
      const { service, conversationRepository, tenantRepository, mediaSender } = buildService();
      tenantRepository.seed({ id: 'tenant-1', name: 'Grátis', apiKeyHash: 'h', plan: 'free' });
      conversationRepository.seed(
        buildConversation({
          status: 'human',
          assignedToUserId: 'op-1',
          sessionName: 'default',
          contactJid: '5511999999999@s.whatsapp.net',
        }),
      );

      await expect(
        service.sendAgentMediaMessage('tenant-1', 'conversation-1', MEDIA, OP),
      ).rejects.toThrow(AgentReplyRequiresPaidPlanError);
      expect(mediaSender.sendCalls).toHaveLength(0);
    });

    it.each(['pro', 'enterprise'] as const)(
      'tenant %s: sendAgentMessage envia normalmente',
      async (plan) => {
        const { service, conversationRepository, tenantRepository, outboundDispatcher } =
          buildService();
        tenantRepository.seed({ id: 'tenant-1', name: 'Paga', apiKeyHash: 'h', plan });
        conversationRepository.seed(
          buildConversation({ status: 'human', assignedToUserId: 'op-1' }),
        );

        await service.sendAgentMessage('tenant-1', 'conversation-1', 'oi', OP);

        expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
      },
    );
  });

  describe('sendAgentMediaMessage() — Fase 1, Bloco F1.3 (envio de mídia pelo operador)', () => {
    const OP = { userId: 'op-1', canResumeAny: false };
    const MEDIA = {
      contentType: 'image' as const,
      buffer: Buffer.from('bytes-da-imagem'),
      mimeType: 'image/jpeg',
      caption: 'Segue a foto',
    };

    it('conversa "human" do próprio operador: chama MediaSender.send, persiste a Message com contentType real e audita', async () => {
      const {
        service,
        conversationRepository,
        messageRepository,
        auditLogRepository,
        mediaSender,
      } = buildService();
      conversationRepository.seed(
        buildConversation({
          status: 'human',
          assignedToUserId: 'op-1',
          sessionName: 'default',
          contactJid: '5511999999999@s.whatsapp.net',
        }),
      );

      const message = await service.sendAgentMediaMessage('tenant-1', 'conversation-1', MEDIA, OP);

      expect(mediaSender.sendCalls).toEqual([
        {
          tenantId: 'tenant-1',
          sessionName: 'default',
          to: '5511999999999@s.whatsapp.net',
          media: MEDIA,
        },
      ]);
      expect(message.direction).toBe('outbound');
      expect(message.contentType).toBe('image');
      expect(message.content).toBe('Segue a foto');
      const persisted = await messageRepository.findById('tenant-1', message.id);
      expect(persisted).toBeDefined();
      expect(
        auditLogRepository
          .all()
          .some((e) => e.action === 'conversation.agent_media_message' && e.actorUserId === 'op-1'),
      ).toBe(true);
    });

    it('sem legenda: content vira string vazia (nunca undefined)', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-1' }));

      const message = await service.sendAgentMediaMessage(
        'tenant-1',
        'conversation-1',
        { contentType: 'audio', buffer: Buffer.from('x'), mimeType: 'audio/ogg' },
        OP,
      );

      expect(message.content).toBe('');
    });

    it('conversa em "bot" (ninguém assumiu): lança ConversationNotHumanError e NÃO envia', async () => {
      const { service, conversationRepository, mediaSender } = buildService();
      conversationRepository.seed(buildConversation({ status: 'bot' }));

      await expect(
        service.sendAgentMediaMessage('tenant-1', 'conversation-1', MEDIA, OP),
      ).rejects.toThrow(ConversationNotHumanError);
      expect(mediaSender.sendCalls).toHaveLength(0);
    });

    it('conversa inexistente/de outro tenant: ConversationNotFoundError', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', tenantId: 'tenant-2' }));

      await expect(
        service.sendAgentMediaMessage('tenant-1', 'conversation-1', MEDIA, OP),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('Operator tentando enviar mídia numa conversa de OUTRO: ConversationOwnershipError e NÃO envia', async () => {
      const { service, conversationRepository, mediaSender } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-2' }));

      await expect(
        service.sendAgentMediaMessage('tenant-1', 'conversation-1', MEDIA, OP),
      ).rejects.toThrow(ConversationOwnershipError);
      expect(mediaSender.sendCalls).toHaveLength(0);
    });

    it('Manager (canResumeAny) envia mídia numa conversa de qualquer um', async () => {
      const { service, conversationRepository, mediaSender } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-2' }));

      await service.sendAgentMediaMessage('tenant-1', 'conversation-1', MEDIA, {
        userId: 'mgr-1',
        canResumeAny: true,
      });

      expect(mediaSender.sendCalls).toHaveLength(1);
    });

    it('lança TenantNotFoundError quando o tenant não existe', async () => {
      const { service } = buildService();

      await expect(
        service.sendAgentMediaMessage('tenant-inexistente', 'conversation-1', MEDIA, OP),
      ).rejects.toThrow(TenantNotFoundError);
    });

    it('arquivo maior que o teto: lança AgentMediaTooLargeError e NÃO envia', async () => {
      const { service, conversationRepository, mediaSender } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-1' }));
      const tooLarge = { ...MEDIA, buffer: Buffer.alloc(17 * 1024 * 1024) };

      await expect(
        service.sendAgentMediaMessage('tenant-1', 'conversation-1', tooLarge, OP),
      ).rejects.toThrow(AgentMediaTooLargeError);
      expect(mediaSender.sendCalls).toHaveLength(0);
    });

    it('[Fase 1, F1.10] Content-Type declarado não bate com a assinatura binária real: lança AgentMediaTypeMismatchError e NÃO envia', async () => {
      const { service, conversationRepository, mediaSender } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-1' }));
      // Declara "document", mas o binário começa com a assinatura de um JPEG.
      const mislabeled = {
        ...MEDIA,
        contentType: 'document' as const,
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      };

      await expect(
        service.sendAgentMediaMessage('tenant-1', 'conversation-1', mislabeled, OP),
      ).rejects.toThrow(AgentMediaTypeMismatchError);
      expect(mediaSender.sendCalls).toHaveLength(0);
    });

    it('[Fase 1, F1.10] documento sem assinatura reconhecida (ex.: PDF/texto): NÃO bloqueia — envia normalmente', async () => {
      const { service, conversationRepository, mediaSender } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-1' }));
      const pdf = {
        ...MEDIA,
        contentType: 'document' as const,
        buffer: Buffer.from('%PDF-1.4...'),
      };

      await expect(
        service.sendAgentMediaMessage('tenant-1', 'conversation-1', pdf, OP),
      ).resolves.toBeDefined();
      expect(mediaSender.sendCalls).toHaveLength(1);
    });

    it('MediaSender lança (ex.: WhatsAppNotConnectedError): propaga, NÃO persiste Message nem audita', async () => {
      const {
        service,
        conversationRepository,
        messageRepository,
        auditLogRepository,
        mediaSender,
      } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-1' }));
      mediaSender.nextError = new Error('sessão desconectada');

      await expect(
        service.sendAgentMediaMessage('tenant-1', 'conversation-1', MEDIA, OP),
      ).rejects.toThrow('sessão desconectada');
      expect(
        await messageRepository.listRecentByConversation('tenant-1', 'conversation-1', 10),
      ).toHaveLength(0);
      expect(
        auditLogRepository.all().some((e) => e.action === 'conversation.agent_media_message'),
      ).toBe(false);
    });

    it('sem MediaSender configurado: recusa com erro claro', async () => {
      const conversationRepository = new FakeConversationRepository();
      const tenantRepository = new FakeTenantRepository();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa', apiKeyHash: 'h' });
      conversationRepository.seed(buildConversation({ status: 'human' }));
      const serviceSemMediaSender = new ConversationsService(
        conversationRepository,
        new FakeMessageRepository(),
        tenantRepository,
        new FakeAuditLogRepository(),
        new NoopLogger(),
      );

      await expect(
        serviceSemMediaSender.sendAgentMediaMessage('tenant-1', 'conversation-1', MEDIA),
      ).rejects.toThrow(/MediaSender não configurado/);
    });
  });

  describe('markAsRead() (indicador de não lidas, 2026-07-25)', () => {
    it('zera unreadCount e devolve a conversa atualizada', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ unreadCount: 5 }));

      const result = await service.markAsRead('tenant-1', 'conversation-1');

      expect(result.unreadCount).toBe(0);
    });

    it('e idempotente: marcar como lida uma conversa ja com unreadCount 0 nao lanca', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ unreadCount: 0 }));

      const result = await service.markAsRead('tenant-1', 'conversation-1');

      expect(result.unreadCount).toBe(0);
    });

    it('lanca ConversationNotFoundError quando a conversa nao existe', async () => {
      const { service } = buildService();

      await expect(service.markAsRead('tenant-1', 'conversation-inexistente')).rejects.toThrow(
        ConversationNotFoundError,
      );
    });

    it('lanca ConversationNotFoundError quando a conversa pertence a outro tenant', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ tenantId: 'tenant-2', unreadCount: 3 }));

      await expect(service.markAsRead('tenant-1', 'conversation-1')).rejects.toThrow(
        ConversationNotFoundError,
      );
    });

    it('lanca TenantNotFoundError quando o tenant nao existe', async () => {
      const { service } = buildService();

      await expect(service.markAsRead('tenant-inexistente', 'conversation-1')).rejects.toThrow(
        TenantNotFoundError,
      );
    });
  });

  describe('markAsUnread() (Menu "⋮" da conversa, 2026-08-29)', () => {
    it('marca a conversa como não lida (unreadCount > 0)', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ unreadCount: 0 }));

      const result = await service.markAsUnread('tenant-1', 'conversation-1');

      expect(result.unreadCount).toBeGreaterThan(0);
    });

    it('lanca ConversationNotFoundError quando a conversa nao existe', async () => {
      const { service } = buildService();

      await expect(
        service.markAsUnread('tenant-1', 'conversa-inexistente'),
      ).rejects.toBeInstanceOf(ConversationNotFoundError);
    });
  });

  describe('setArchived() (Menu "⋮" da conversa, 2026-08-29)', () => {
    it('arquiva a conversa e grava archivedAt', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ archived: false }));

      const result = await service.setArchived('tenant-1', 'conversation-1', true);

      expect(result.archived).toBe(true);
      expect(result.archivedAt).toBeDefined();
    });

    it('desarquivar limpa archivedAt', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(
        buildConversation({ archived: true, archivedAt: new Date('2026-08-01T00:00:00Z') }),
      );

      const result = await service.setArchived('tenant-1', 'conversation-1', false);

      expect(result.archived).toBe(false);
      expect(result.archivedAt).toBeUndefined();
    });

    it('lanca ConversationNotFoundError quando a conversa nao existe', async () => {
      const { service } = buildService();

      await expect(
        service.setArchived('tenant-1', 'conversa-inexistente', true),
      ).rejects.toBeInstanceOf(ConversationNotFoundError);
    });
  });

  describe('deleteConversation() (Menu "⋮" da conversa, 2026-08-29)', () => {
    it('remove a conversa de verdade', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation());

      await service.deleteConversation('tenant-1', 'conversation-1');

      await expect(service.getConversation('tenant-1', 'conversation-1')).rejects.toBeInstanceOf(
        ConversationNotFoundError,
      );
    });

    it('lanca ConversationNotFoundError quando a conversa nao existe', async () => {
      const { service } = buildService();

      await expect(
        service.deleteConversation('tenant-1', 'conversa-inexistente'),
      ).rejects.toBeInstanceOf(ConversationNotFoundError);
    });
  });

  describe('updateStage() (pipeline de CRM, Milestone 6, Bloco M6H-5)', () => {
    it('grava o novo stage, SEMPRE com stageSetBy "human", e devolve a conversa atualizada', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ stage: 'new', stageSetBy: 'ai' }));

      const result = await service.updateStage('tenant-1', 'conversation-1', 'negotiating');

      expect(result.stage).toBe('negotiating');
      expect(result.stageSetBy).toBe('human');
    });

    it('sobrescreve mesmo uma conversa já travada por humano (ação humana é sempre permitida)', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ stage: 'contacted', stageSetBy: 'human' }));

      const result = await service.updateStage('tenant-1', 'conversation-1', 'closed_won');

      expect(result.stage).toBe('closed_won');
      expect(result.stageSetBy).toBe('human');
    });

    it('audita conversation.stage_changed com o ator informado', async () => {
      const { service, conversationRepository, auditLogRepository } = buildService();
      conversationRepository.seed(buildConversation());

      await service.updateStage('tenant-1', 'conversation-1', 'contacted', {
        userId: 'op-1',
        canResumeAny: true,
      });

      expect(
        auditLogRepository
          .all()
          .some(
            (e) =>
              e.action === 'conversation.stage_changed' &&
              e.actorUserId === 'op-1' &&
              e.targetId === 'conversation-1',
          ),
      ).toBe(true);
    });

    it('lanca ConversationNotFoundError quando a conversa nao existe', async () => {
      const { service } = buildService();

      await expect(
        service.updateStage('tenant-1', 'conversation-inexistente', 'contacted'),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('lanca ConversationNotFoundError quando a conversa pertence a outro tenant', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ tenantId: 'tenant-2' }));

      await expect(service.updateStage('tenant-1', 'conversation-1', 'contacted')).rejects.toThrow(
        ConversationNotFoundError,
      );
    });

    it('lanca TenantNotFoundError quando o tenant nao existe', async () => {
      const { service } = buildService();

      await expect(
        service.updateStage('tenant-inexistente', 'conversation-1', 'contacted'),
      ).rejects.toThrow(TenantNotFoundError);
    });
  });

  describe('setExcludedFromPipeline() — ADR #94 (2026-08-01, validação Fase 1)', () => {
    it('marca a conversa como fora do funil comercial e devolve a conversa atualizada', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ excludedFromPipeline: false }));

      const result = await service.setExcludedFromPipeline('tenant-1', 'conversation-1', true);

      expect(result.excludedFromPipeline).toBe(true);
    });

    it('devolve a conversa ao funil comercial', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ excludedFromPipeline: true }));

      const result = await service.setExcludedFromPipeline('tenant-1', 'conversation-1', false);

      expect(result.excludedFromPipeline).toBe(false);
    });

    it('audita conversation.excluded_from_pipeline ao marcar', async () => {
      const { service, conversationRepository, auditLogRepository } = buildService();
      conversationRepository.seed(buildConversation());

      await service.setExcludedFromPipeline('tenant-1', 'conversation-1', true, {
        userId: 'op-1',
        canResumeAny: true,
      });

      expect(
        auditLogRepository
          .all()
          .some(
            (e) =>
              e.action === 'conversation.excluded_from_pipeline' &&
              e.actorUserId === 'op-1' &&
              e.targetId === 'conversation-1',
          ),
      ).toBe(true);
    });

    it('audita conversation.included_in_pipeline ao desmarcar', async () => {
      const { service, conversationRepository, auditLogRepository } = buildService();
      conversationRepository.seed(buildConversation({ excludedFromPipeline: true }));

      await service.setExcludedFromPipeline('tenant-1', 'conversation-1', false, {
        userId: 'op-1',
        canResumeAny: true,
      });

      expect(
        auditLogRepository
          .all()
          .some(
            (e) =>
              e.action === 'conversation.included_in_pipeline' && e.targetId === 'conversation-1',
          ),
      ).toBe(true);
    });

    it('lanca ConversationNotFoundError quando a conversa nao existe', async () => {
      const { service } = buildService();

      await expect(
        service.setExcludedFromPipeline('tenant-1', 'conversation-inexistente', true),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('lanca ConversationNotFoundError quando a conversa pertence a outro tenant', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ tenantId: 'tenant-2' }));

      await expect(
        service.setExcludedFromPipeline('tenant-1', 'conversation-1', true),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('lanca TenantNotFoundError quando o tenant nao existe', async () => {
      const { service } = buildService();

      await expect(
        service.setExcludedFromPipeline('tenant-inexistente', 'conversation-1', true),
      ).rejects.toThrow(TenantNotFoundError);
    });
  });

  describe('saveContactFromConversation() — retrofit visual 2026-08-18 (botão "Salvar contato")', () => {
    it('quando a conversa já tem contactId, só grava o nome (não chama resolveByWhatsAppJid)', async () => {
      const { service, conversationRepository, contactResolver } = buildService();
      conversationRepository.seed(buildConversation({ contactId: 'contact-99' }));

      const result = await service.saveContactFromConversation(
        'tenant-1',
        'conversation-1',
        'Maria Costa',
      );

      expect(result.contactId).toBe('contact-99');
      expect(contactResolver.calls).toEqual([]);
      expect(contactResolver.saveNameCalls).toEqual([
        { tenantId: 'tenant-1', contactId: 'contact-99', name: 'Maria Costa' },
      ]);
    });

    it('quando a conversa ainda não tem contactId, resolve e LIGA a conversa ao contato', async () => {
      const { service, conversationRepository, contactResolver } = buildService();
      contactResolver.setContactId('contact-novo');
      conversationRepository.seed(
        buildConversation({ contactId: undefined, contactJid: '5511999999999@s.whatsapp.net' }),
      );

      const result = await service.saveContactFromConversation(
        'tenant-1',
        'conversation-1',
        'Maria Costa',
      );

      expect(result.contactId).toBe('contact-novo');
      expect(contactResolver.calls).toEqual([
        { tenantId: 'tenant-1', contactJid: '5511999999999@s.whatsapp.net' },
      ]);
    });

    it('salva sem nome (name ausente é válido) — não chama saveName', async () => {
      const { service, conversationRepository, contactResolver } = buildService();
      conversationRepository.seed(buildConversation({ contactId: 'contact-99' }));

      await service.saveContactFromConversation('tenant-1', 'conversation-1', undefined);

      expect(contactResolver.saveNameCalls).toEqual([]);
    });

    it('lança ConversationContactUnavailableError quando não há telefone a derivar (@lid)', async () => {
      const { service, conversationRepository, contactResolver } = buildService();
      contactResolver.setUnresolvable();
      conversationRepository.seed(
        buildConversation({ contactId: undefined, contactJid: '225236742053984@lid' }),
      );

      await expect(
        service.saveContactFromConversation('tenant-1', 'conversation-1', 'Maria'),
      ).rejects.toBeInstanceOf(ConversationContactUnavailableError);
    });

    it('audita conversation.contact_saved', async () => {
      const { service, conversationRepository, auditLogRepository } = buildService();
      conversationRepository.seed(buildConversation({ contactId: 'contact-99' }));

      await service.saveContactFromConversation('tenant-1', 'conversation-1', 'Maria Costa', {
        userId: 'op-1',
        canResumeAny: true,
      });

      expect(
        auditLogRepository
          .all()
          .some(
            (e) =>
              e.action === 'conversation.contact_saved' &&
              e.actorUserId === 'op-1' &&
              e.targetId === 'conversation-1',
          ),
      ).toBe(true);
    });

    it('lança ConversationNotFoundError quando a conversa não existe', async () => {
      const { service } = buildService();

      await expect(
        service.saveContactFromConversation('tenant-1', 'conversation-inexistente', 'Maria'),
      ).rejects.toBeInstanceOf(ConversationNotFoundError);
    });

    it('lança ConversationNotFoundError (IDOR) quando a conversa é de OUTRO tenant', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ tenantId: 'tenant-2' }));

      await expect(
        service.saveContactFromConversation('tenant-1', 'conversation-1', 'Maria'),
      ).rejects.toBeInstanceOf(ConversationNotFoundError);
    });

    it('lança TenantNotFoundError quando o tenant não existe', async () => {
      const { service } = buildService();

      await expect(
        service.saveContactFromConversation('tenant-inexistente', 'conversation-1', 'Maria'),
      ).rejects.toBeInstanceOf(TenantNotFoundError);
    });

    it('propaga erro se saveName falhar (o operador precisa ver a falha)', async () => {
      const { service, conversationRepository, contactResolver } = buildService();
      conversationRepository.seed(buildConversation({ contactId: 'contact-99' }));
      contactResolver.setSaveNameError(new Error('falha de banco'));

      await expect(
        service.saveContactFromConversation('tenant-1', 'conversation-1', 'Maria'),
      ).rejects.toThrow('falha de banco');
    });
  });

  describe('listConversations() — filtro excludedFromPipeline (ADR #94)', () => {
    it('sem o filtro, lista TODAS as conversas (dentro e fora do funil)', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(
        buildConversation({ id: 'c-dentro', excludedFromPipeline: false }),
      );
      conversationRepository.seed(buildConversation({ id: 'c-fora', excludedFromPipeline: true }));

      const page = await service.listConversations('tenant-1', {});

      expect(page.conversations.map((c) => c.id).sort()).toEqual(['c-dentro', 'c-fora']);
    });

    it('com excludedFromPipeline: false, lista só as conversas dentro do funil', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(
        buildConversation({ id: 'c-dentro', excludedFromPipeline: false }),
      );
      conversationRepository.seed(buildConversation({ id: 'c-fora', excludedFromPipeline: true }));

      const page = await service.listConversations('tenant-1', { excludedFromPipeline: false });

      expect(page.conversations.map((c) => c.id)).toEqual(['c-dentro']);
    });
  });

  describe('getMessageMedia() — Fase 1, Bloco F1.1 (ADR #90)', () => {
    it('devolve o binário decifrado, resolvendo o sessionName a partir da Conversation', async () => {
      const { service, conversationRepository, messageRepository, mediaDownloader } =
        buildService();
      conversationRepository.seed(buildConversation({ sessionName: 'vendas' }));
      await messageRepository.create(
        buildMessage({
          contentType: 'image',
          media: {
            mimeType: 'image/jpeg',
            url: 'https://mmg.whatsapp.net/x.enc',
            mediaKeyEncrypted: 'enc:abc',
            fileName: 'foto.jpg',
          },
        }),
      );
      mediaDownloader.nextResult = Buffer.from('bytes-da-imagem');

      const result = await service.getMessageMedia('tenant-1', 'conversation-1', 'message-1');

      expect(result).toEqual({
        mimeType: 'image/jpeg',
        fileName: 'foto.jpg',
        data: Buffer.from('bytes-da-imagem'),
      });
      expect(mediaDownloader.downloadCalls).toEqual([
        {
          tenantId: 'tenant-1',
          sessionName: 'vendas',
          media: {
            contentType: 'image',
            mimeType: 'image/jpeg',
            url: 'https://mmg.whatsapp.net/x.enc',
            mediaKeyEncrypted: 'enc:abc',
          },
        },
      ]);
    });

    it('Fase 1, Bloco F1.3: mídia enviada pelo OPERADOR (sem url/mediaKeyEncrypted) é servida via agentMediaCache, sem chamar MediaDownloader', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(
        buildConversation({ status: 'human', assignedToUserId: 'op-1', sessionName: 'vendas' }),
      );

      const message = await service.sendAgentMediaMessage(
        'tenant-1',
        'conversation-1',
        {
          contentType: 'image',
          buffer: Buffer.from('bytes-do-operador'),
          mimeType: 'image/jpeg',
          fileName: 'enviado.jpg',
        },
        { userId: 'op-1', canResumeAny: false },
      );

      const result = await service.getMessageMedia('tenant-1', 'conversation-1', message.id);

      expect(result).toEqual({
        mimeType: 'image/jpeg',
        fileName: 'enviado.jpg',
        data: Buffer.from('bytes-do-operador'),
      });
    });

    it('lanca MessageMediaNotFoundError quando a mensagem nao existe', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation());

      await expect(
        service.getMessageMedia('tenant-1', 'conversation-1', 'message-inexistente'),
      ).rejects.toThrow(MessageMediaNotFoundError);
    });

    it('lanca MessageMediaNotFoundError quando a mensagem pertence a outro tenant', async () => {
      const { service, conversationRepository, messageRepository } = buildService();
      conversationRepository.seed(buildConversation());
      await messageRepository.create(
        buildMessage({
          tenantId: 'tenant-2',
          contentType: 'image',
          media: {
            mimeType: 'image/jpeg',
            url: 'https://mmg.whatsapp.net/x.enc',
            mediaKeyEncrypted: 'enc:abc',
          },
        }),
      );

      await expect(
        service.getMessageMedia('tenant-1', 'conversation-1', 'message-1'),
      ).rejects.toThrow(MessageMediaNotFoundError);
    });

    it('lanca MessageMediaNotFoundError quando a mensagem e de outra conversa', async () => {
      const { service, conversationRepository, messageRepository } = buildService();
      conversationRepository.seed(buildConversation({ id: 'conversation-1' }));
      await messageRepository.create(
        buildMessage({
          conversationId: 'conversation-2',
          contentType: 'image',
          media: {
            mimeType: 'image/jpeg',
            url: 'https://mmg.whatsapp.net/x.enc',
            mediaKeyEncrypted: 'enc:abc',
          },
        }),
      );

      await expect(
        service.getMessageMedia('tenant-1', 'conversation-1', 'message-1'),
      ).rejects.toThrow(MessageMediaNotFoundError);
    });

    it('lanca MessageMediaNotFoundError quando a mensagem e de texto (sem media)', async () => {
      const { service, conversationRepository, messageRepository } = buildService();
      conversationRepository.seed(buildConversation());
      await messageRepository.create(buildMessage({ contentType: 'text', content: 'oi' }));

      await expect(
        service.getMessageMedia('tenant-1', 'conversation-1', 'message-1'),
      ).rejects.toThrow(MessageMediaNotFoundError);
    });

    it('lanca MessageMediaNotFoundError quando o MediaDownloader nao esta configurado', async () => {
      const conversationRepository = new FakeConversationRepository();
      const messageRepository = new FakeMessageRepository();
      const tenantRepository = new FakeTenantRepository();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: 'hash-qualquer' });
      const service = new ConversationsService(
        conversationRepository,
        messageRepository,
        tenantRepository,
        new FakeAuditLogRepository(),
        new NoopLogger(),
      );
      conversationRepository.seed(buildConversation());
      await messageRepository.create(
        buildMessage({
          contentType: 'image',
          media: {
            mimeType: 'image/jpeg',
            url: 'https://mmg.whatsapp.net/x.enc',
            mediaKeyEncrypted: 'enc:abc',
          },
        }),
      );

      await expect(
        service.getMessageMedia('tenant-1', 'conversation-1', 'message-1'),
      ).rejects.toThrow(MessageMediaNotFoundError);
    });

    it('lanca MessageMediaNotFoundError quando o download falha (MediaDownloader devolve undefined)', async () => {
      const { service, conversationRepository, messageRepository, mediaDownloader } =
        buildService();
      conversationRepository.seed(buildConversation());
      await messageRepository.create(
        buildMessage({
          contentType: 'image',
          media: {
            mimeType: 'image/jpeg',
            url: 'https://mmg.whatsapp.net/x.enc',
            mediaKeyEncrypted: 'enc:abc',
          },
        }),
      );
      mediaDownloader.nextResult = undefined;

      await expect(
        service.getMessageMedia('tenant-1', 'conversation-1', 'message-1'),
      ).rejects.toThrow(MessageMediaNotFoundError);
    });

    it('lanca TenantNotFoundError quando o tenant nao existe', async () => {
      const { service } = buildService();

      await expect(
        service.getMessageMedia('tenant-inexistente', 'conversation-1', 'message-1'),
      ).rejects.toThrow(TenantNotFoundError);
    });
  });
});
