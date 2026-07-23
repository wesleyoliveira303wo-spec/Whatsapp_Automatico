import { MessageIngestionService } from '../../../src/services/conversations/application/MessageIngestionService';
import { InboundWhatsAppMessage } from '../../../src/services/whatsapp/domain/handlers/MessageReceivedHandler';
import { FakeConversationRepository, FakeMessageRepository, FakeAiReplyScheduler } from './testDoubles';

function buildSut(): {
  sut: MessageIngestionService;
  conversationRepository: FakeConversationRepository;
  messageRepository: FakeMessageRepository;
  aiReplyScheduler: FakeAiReplyScheduler;
} {
  const conversationRepository = new FakeConversationRepository();
  const messageRepository = new FakeMessageRepository();
  const aiReplyScheduler = new FakeAiReplyScheduler();
  const sut = new MessageIngestionService(conversationRepository, messageRepository, aiReplyScheduler);
  return { sut, conversationRepository, messageRepository, aiReplyScheduler };
}

function buildInboundMessage(overrides: Partial<InboundWhatsAppMessage> = {}): InboundWhatsAppMessage {
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

    it('NÃO agenda resposta de IA quando a conversa já foi escalonada a um humano', async () => {
      const { sut, conversationRepository, aiReplyScheduler } = buildSut();
      conversationRepository.seed({
        id: 'conversation-escalated',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        status: 'human',
        createdAt: new Date('2026-07-09T00:00:00.000Z'),
        updatedAt: new Date('2026-07-09T00:00:00.000Z'),
      });

      await sut.handle(buildInboundMessage());

      expect(aiReplyScheduler.scheduleCalls).toHaveLength(0);
    });

    it('mesmo sem agendar IA, ainda assim persiste a mensagem de uma conversa escalonada', async () => {
      const { sut, conversationRepository, messageRepository } = buildSut();
      conversationRepository.seed({
        id: 'conversation-escalated',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        status: 'human',
        createdAt: new Date('2026-07-09T00:00:00.000Z'),
        updatedAt: new Date('2026-07-09T00:00:00.000Z'),
      });

      await sut.handle(buildInboundMessage());

      expect(messageRepository.getAll()).toHaveLength(1);
    });

    it('propaga uma falha de AiReplyScheduler.schedule() (não engole o erro)', async () => {
      const { sut, aiReplyScheduler } = buildSut();
      aiReplyScheduler.failNextSchedule = true;

      await expect(sut.handle(buildInboundMessage())).rejects.toThrow('Falha simulada no AiReplyScheduler');
    });
  });
});
