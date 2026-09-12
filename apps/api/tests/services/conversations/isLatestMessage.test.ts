import { Message } from '../../../src/services/conversations/domain/entities/Message';
import { isLatestMessage } from '../../../src/services/conversations/domain/policies/isLatestMessage';

function message(id: string, occurredAt: string, direction: Message['direction']): Message {
  return {
    id,
    tenantId: 't1',
    conversationId: 'c1',
    direction,
    content: id,
    contentType: 'text',
    occurredAt: new Date(occurredAt),
    createdAt: new Date(occurredAt),
  } as Message;
}

describe('isLatestMessage', () => {
  it('true para a mensagem mais recente, em qualquer direção', () => {
    const messages = [
      message('a', '2026-09-11T10:00:00Z', 'inbound'),
      message('b', '2026-09-11T10:01:00Z', 'outbound'),
    ];
    expect(isLatestMessage(messages, 'b')).toBe(true);
    expect(isLatestMessage(messages, 'a')).toBe(false);
  });

  it('uma resposta do atendente mais nova tira a vez da mensagem do cliente', () => {
    const messages = [
      message('cliente', '2026-09-11T10:00:00Z', 'inbound'),
      message('atendente', '2026-09-11T10:00:30Z', 'outbound'),
    ];
    expect(isLatestMessage(messages, 'cliente')).toBe(false);
  });

  it('empate de segundo: exatamente uma vence (desempate por id)', () => {
    const messages = [
      message('m-1', '2026-09-11T10:00:00Z', 'inbound'),
      message('m-2', '2026-09-11T10:00:00Z', 'inbound'),
    ];
    const winners = ['m-1', 'm-2'].filter((id) => isLatestMessage(messages, id));
    expect(winners).toEqual(['m-2']);
  });

  it('mensagem fora da lista lida: false (existe uma mais nova)', () => {
    expect(isLatestMessage([message('x', '2026-09-11T10:00:00Z', 'inbound')], 'ausente')).toBe(false);
  });
});
