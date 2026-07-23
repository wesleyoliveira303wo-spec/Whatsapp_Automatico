import { Conversation } from '../../../../src/domain/entities/Conversation';
import { ConversationStatus } from '../../../../src/domain/enums/ConversationStatus';

describe('Conversation Entity', () => {
  const baseProps = {
    id: 'conv1',
    tenantId: 'tenant1',
    contactId: 'contact1',
    status: ConversationStatus.NEW,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('should create a conversation with defaults', () => {
    const conv = new Conversation(baseProps);
    expect(conv.id).toBe('conv1');
    expect(conv.status).toBe(ConversationStatus.NEW);
  });

  it('should change status correctly', () => {
    const conv = new Conversation(baseProps);
    conv.changeStatus(ConversationStatus.ACTIVE);
    expect(conv.status).toBe(ConversationStatus.ACTIVE);
  });

  it('should not allow transition from CLOSED to non‑CLOSED', () => {
    const conv = new Conversation({ ...baseProps, status: ConversationStatus.CLOSED });
    expect(() => conv.changeStatus(ConversationStatus.ACTIVE)).toThrow();
  });

  it('should assign to a user', () => {
    const conv = new Conversation(baseProps);
    conv.assignTo('user1');
    expect(conv.assignedTo).toBe('user1');
  });
});
