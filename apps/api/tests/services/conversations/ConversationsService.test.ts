import { ConversationsService } from '../../../src/services/conversations/application/ConversationsService';
import { TenantNotFoundError } from '../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { ConversationNotFoundError } from '../../../src/services/conversations/domain/errors/ConversationNotFoundError';
import { Conversation } from '../../../src/services/conversations/domain/entities/Conversation';
import { ConversationOwnershipError } from '../../../src/services/conversations/domain/errors/ConversationOwnershipError';
import { ConversationNotHumanError } from '../../../src/services/conversations/domain/errors/ConversationNotHumanError';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../shared/tenant/FakeTenantRepository';
import { FakeAuditLogRepository } from '../auth/testDoubles';
import { FakeConversationRepository, FakeMessageRepository } from './testDoubles';
import { FakeOutboundMessageDispatcher } from '../whatsapp/infrastructure/FakeOutboundMessageDispatcher';

function buildConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-1',
    tenantId: 'tenant-1',
    sessionName: 'default',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'bot',
    createdAt: new Date('2026-07-10T12:00:00Z'),
    updatedAt: new Date('2026-07-10T12:00:00Z'),
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
} {
  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();
  const tenantRepository = new FakeTenantRepository();
  const auditLogRepository = new FakeAuditLogRepository();
  const outboundDispatcher = new FakeOutboundMessageDispatcher();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: 'hash-qualquer' });
  const service = new ConversationsService(
    conversationRepository,
    messageRepository,
    tenantRepository,
    auditLogRepository,
    new NoopLogger(),
    outboundDispatcher,
  );
  return { service, conversationRepository, messageRepository, tenantRepository, auditLogRepository, outboundDispatcher };
}

describe('ConversationsService', () => {
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

      await expect(service.escalateConversation('tenant-1', 'conversation-inexistente')).rejects.toThrow(ConversationNotFoundError);
    });

    it('lanca ConversationNotFoundError (nao vaza a existencia do recurso) quando a conversa pertence a OUTRO tenant', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ tenantId: 'tenant-2' }));

      await expect(service.escalateConversation('tenant-1', 'conversation-1')).rejects.toThrow(ConversationNotFoundError);
    });

    it('lanca TenantNotFoundError quando o tenant nao existe, ANTES de tocar o ConversationRepository', async () => {
      const { service, conversationRepository } = buildService();
      const updateStatusSpy = jest.spyOn(conversationRepository, 'updateStatus');

      await expect(service.escalateConversation('tenant-inexistente', 'conversation-1')).rejects.toThrow(TenantNotFoundError);
      expect(updateStatusSpy).not.toHaveBeenCalled();
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
      expect(auditLogRepository.all().some((e) => e.action === 'conversation.escalated' && e.actorUserId === 'op-1' && e.targetId === 'conversation-1')).toBe(true);
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

      await expect(service.resumeConversation('tenant-1', 'conversation-1', OP)).rejects.toThrow(ConversationOwnershipError);
    });

    it('Manager (canResumeAny) retoma a conversa de QUALQUER um', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-2' }));

      const result = await service.resumeConversation('tenant-1', 'conversation-1', { userId: 'mgr-1', canResumeAny: true });

      expect(result.status).toBe('bot');
    });

    it('plano maquina (default) escala sem dono (assignedToUserId undefined) e audita sem ator', async () => {
      const { service, conversationRepository, auditLogRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'bot' }));

      const result = await service.escalateConversation('tenant-1', 'conversation-1');

      expect(result.assignedToUserId).toBeUndefined();
      expect(auditLogRepository.all().some((e) => e.action === 'conversation.escalated' && e.actorUserId === undefined)).toBe(true);
    });
  });

  describe('listConversations() (D11 - paginacao por cursor)', () => {
    it('aplica DEFAULT_LIST_LIMIT quando limit nao e informado', async () => {
      const { service, conversationRepository } = buildService();
      const findAllByTenantSpy = jest.spyOn(conversationRepository, 'findAllByTenant');
      conversationRepository.seed(buildConversation());

      await service.listConversations('tenant-1');

      expect(findAllByTenantSpy).toHaveBeenCalledWith('tenant-1', { status: undefined, limit: 50, cursor: undefined });
    });

    it('nunca excede MAX_LIST_LIMIT mesmo se um limit maior for pedido', async () => {
      const { service, conversationRepository } = buildService();
      const findAllByTenantSpy = jest.spyOn(conversationRepository, 'findAllByTenant');

      await service.listConversations('tenant-1', { limit: 999999 });

      expect(findAllByTenantSpy).toHaveBeenCalledWith('tenant-1', { status: undefined, limit: 200, cursor: undefined });
    });

    it('repassa status/cursor ao repositorio quando informados', async () => {
      const { service, conversationRepository } = buildService();
      const findAllByTenantSpy = jest.spyOn(conversationRepository, 'findAllByTenant');

      await service.listConversations('tenant-1', { status: 'human', cursor: 'conversation-anterior', limit: 10 });

      expect(findAllByTenantSpy).toHaveBeenCalledWith('tenant-1', { status: 'human', limit: 10, cursor: 'conversation-anterior' });
    });

    it('lanca TenantNotFoundError quando o tenant nao existe', async () => {
      const { service } = buildService();

      await expect(service.listConversations('tenant-inexistente')).rejects.toThrow(TenantNotFoundError);
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
        occurredAt: new Date('2026-07-10T12:00:00Z'),
      });
      await messageRepository.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'outbound',
        content: 'segunda',
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

      await expect(service.listMessages('tenant-inexistente', 'conversation-1')).rejects.toThrow(TenantNotFoundError);
    });
  });

  describe('sendAgentMessage() (N2 - resposta do operador)', () => {
    const OP = { userId: 'op-1', canResumeAny: false };

    it('conversa "human" do proprio operador: despacha pela fila outbound (com idempotencyKey, sem aiInteractionId) e audita', async () => {
      const { service, conversationRepository, auditLogRepository, outboundDispatcher } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-1' }));

      await service.sendAgentMessage('tenant-1', 'conversation-1', 'Oi, posso ajudar!', OP);

      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
      const command = outboundDispatcher.dispatchCalls[0];
      expect(command).toMatchObject({ tenantId: 'tenant-1', conversationId: 'conversation-1', content: 'Oi, posso ajudar!' });
      expect(typeof command.idempotencyKey).toBe('string');
      expect(command.aiInteractionId).toBeUndefined();
      expect(auditLogRepository.all().some((e) => e.action === 'conversation.agent_message' && e.actorUserId === 'op-1')).toBe(true);
    });

    it('conversa em "bot" (ninguem assumiu): lanca ConversationNotHumanError e NAO despacha', async () => {
      const { service, conversationRepository, outboundDispatcher } = buildService();
      conversationRepository.seed(buildConversation({ status: 'bot' }));

      await expect(service.sendAgentMessage('tenant-1', 'conversation-1', 'oi', OP)).rejects.toThrow(ConversationNotHumanError);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
    });

    it('conversa inexistente/de outro tenant: ConversationNotFoundError', async () => {
      const { service, conversationRepository } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', tenantId: 'tenant-2' }));

      await expect(service.sendAgentMessage('tenant-1', 'conversation-1', 'oi', OP)).rejects.toThrow(ConversationNotFoundError);
    });

    it('Operator tentando responder a conversa de OUTRO: ConversationOwnershipError e NAO despacha', async () => {
      const { service, conversationRepository, outboundDispatcher } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-2' }));

      await expect(service.sendAgentMessage('tenant-1', 'conversation-1', 'oi', OP)).rejects.toThrow(ConversationOwnershipError);
      expect(outboundDispatcher.dispatchCalls).toHaveLength(0);
    });

    it('Manager (canResumeAny) responde a conversa de qualquer um', async () => {
      const { service, conversationRepository, outboundDispatcher } = buildService();
      conversationRepository.seed(buildConversation({ status: 'human', assignedToUserId: 'op-2' }));

      await service.sendAgentMessage('tenant-1', 'conversation-1', 'oi', { userId: 'mgr-1', canResumeAny: true });

      expect(outboundDispatcher.dispatchCalls).toHaveLength(1);
    });

    it('lanca TenantNotFoundError quando o tenant nao existe', async () => {
      const { service } = buildService();

      await expect(service.sendAgentMessage('tenant-inexistente', 'conversation-1', 'oi', OP)).rejects.toThrow(TenantNotFoundError);
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

      await expect(serviceSemDispatcher.sendAgentMessage('tenant-1', 'conversation-1', 'oi')).rejects.toThrow(
        /OutboundMessageDispatcher não configurado/,
      );
    });
  });
});
