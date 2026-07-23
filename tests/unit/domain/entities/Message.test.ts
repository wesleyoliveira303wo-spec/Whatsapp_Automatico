import { Message } from '../../../../src/domain/entities/Message';
import { MessageDirection } from '../../../../src/domain/enums/MessageDirection';
import { MessageType } from '../../../../src/domain/enums/MessageType';
import { MessageStatus } from '../../../../src/domain/enums/MessageStatus';

describe('Message Entity', () => {
  const baseProps = {
    id: 'msg1',
    conversationId: 'conv1',
    direction: MessageDirection.IN,
    type: MessageType.TEXT,
    content: 'Hello',
    status: MessageStatus.SENT,
    receivedAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('should create a message', () => {
    const msg = new Message(baseProps);
    expect(msg.id).toBe('msg1');
    expect(msg.content).toBe('Hello');
    expect(msg.status).toBe(MessageStatus.SENT);
  });

  it('should update status and set sentAt when SENT', () => {
    const msg = new Message(baseProps);
    const now = new Date('2026-01-02T00:00:00Z');
    msg.updateStatus(MessageStatus.SENT, now);
    expect(msg.status).toBe(MessageStatus.SENT);
    expect(msg.sentAt?.toISOString()).toBe(now.toISOString());
  });

  it('should prevent transition from FAILED to other status', () => {
    const msg = new Message({ ...baseProps, status: MessageStatus.FAILED });
    expect(() => msg.updateStatus(MessageStatus.DELIVERED)).toThrow();
  });
});
