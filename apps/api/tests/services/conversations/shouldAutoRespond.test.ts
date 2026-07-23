import { shouldAutoRespond } from '../../../src/services/conversations/domain/policies/shouldAutoRespond';
import { Conversation } from '../../../src/services/conversations/domain/entities/Conversation';

function buildConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-1',
    tenantId: 'tenant-1',
    sessionName: 'default',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'bot',
    createdAt: new Date('2026-07-10T00:00:00.000Z'),
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
    ...overrides,
  };
}

describe('shouldAutoRespond', () => {
  it('retorna true quando a conversa está em modo bot', () => {
    expect(shouldAutoRespond(buildConversation({ status: 'bot' }))).toBe(true);
  });

  it('retorna false quando a conversa foi escalonada a um humano', () => {
    expect(shouldAutoRespond(buildConversation({ status: 'human' }))).toBe(false);
  });
});
