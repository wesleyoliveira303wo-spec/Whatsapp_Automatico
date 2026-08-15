import { shouldGenerateReply } from '../../../src/services/conversations/domain/policies/shouldGenerateReply';
import { Message } from '../../../src/services/conversations/domain/entities/Message';

function buildMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'message-1',
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    direction: 'inbound',
    content: 'Olá',
    contentType: 'text',
    occurredAt: new Date('2026-08-14T12:00:00.000Z'),
    ...overrides,
  };
}

describe('shouldGenerateReply', () => {
  it('retorna true quando a mensagem do job é a única da conversa', () => {
    const messages = [buildMessage({ id: 'm1' })];

    expect(shouldGenerateReply(messages, 'm1')).toBe(true);
  });

  it('retorna true quando a mensagem do job é a inbound mais recente', () => {
    const messages = [
      buildMessage({ id: 'm1', occurredAt: new Date('2026-08-14T12:00:00.000Z') }),
      buildMessage({ id: 'm2', occurredAt: new Date('2026-08-14T12:00:05.000Z') }),
    ];

    expect(shouldGenerateReply(messages, 'm2')).toBe(true);
  });

  it('retorna false para os fragmentos anteriores de uma rajada (só o último gera resposta)', () => {
    const messages = [
      buildMessage({ id: 'm1', occurredAt: new Date('2026-08-14T12:00:00.000Z') }),
      buildMessage({ id: 'm2', occurredAt: new Date('2026-08-14T12:00:03.000Z') }),
      buildMessage({ id: 'm3', occurredAt: new Date('2026-08-14T12:00:06.000Z') }),
    ];

    expect(shouldGenerateReply(messages, 'm1')).toBe(false);
    expect(shouldGenerateReply(messages, 'm2')).toBe(false);
    expect(shouldGenerateReply(messages, 'm3')).toBe(true);
  });

  // O caso que motivou a ordem total `(occurredAt, id)`: os timestamps do
  // WhatsApp têm resolução de SEGUNDOS, então fragmentos rápidos empatam.
  // Comparando só por data, ou nenhum job se considera o mais recente
  // (silêncio — o defeito grave) ou todos se consideram (respostas repetidas).
  it('elege exatamente UM vencedor quando os timestamps empatam', () => {
    const mesmoInstante = new Date('2026-08-14T12:00:00.000Z');
    const messages = [
      buildMessage({ id: 'm1', occurredAt: mesmoInstante }),
      buildMessage({ id: 'm2', occurredAt: mesmoInstante }),
      buildMessage({ id: 'm3', occurredAt: mesmoInstante }),
    ];

    const vencedores = ['m1', 'm2', 'm3'].filter((id) => shouldGenerateReply(messages, id));

    expect(vencedores).toHaveLength(1);
  });

  it('ignora mensagens outbound ao decidir qual é a mais recente', () => {
    const messages = [
      buildMessage({ id: 'm1', occurredAt: new Date('2026-08-14T12:00:00.000Z') }),
      buildMessage({
        id: 'resposta-da-ia',
        direction: 'outbound',
        occurredAt: new Date('2026-08-14T12:00:09.000Z'),
      }),
    ];

    // A resposta da IA é mais recente que `m1`, mas não é uma pergunta nova —
    // não pode fazer o job de `m1` se considerar ultrapassado.
    expect(shouldGenerateReply(messages, 'm1')).toBe(true);
  });

  it('não depende da ordem em que as mensagens vêm na lista', () => {
    const foraDeOrdem = [
      buildMessage({ id: 'm3', occurredAt: new Date('2026-08-14T12:00:06.000Z') }),
      buildMessage({ id: 'm1', occurredAt: new Date('2026-08-14T12:00:00.000Z') }),
      buildMessage({ id: 'm2', occurredAt: new Date('2026-08-14T12:00:03.000Z') }),
    ];

    expect(shouldGenerateReply(foraDeOrdem, 'm3')).toBe(true);
    expect(shouldGenerateReply(foraDeOrdem, 'm1')).toBe(false);
  });

  // Degradação segura: gerar uma resposta a mais é sempre preferível a deixar
  // o cliente sem resposta nenhuma.
  it('retorna true quando a mensagem do job não está no histórico lido', () => {
    const messages = [buildMessage({ id: 'm1' })];

    expect(shouldGenerateReply(messages, 'mensagem-fora-da-janela')).toBe(true);
  });

  it('retorna true quando o histórico está vazio', () => {
    expect(shouldGenerateReply([], 'm1')).toBe(true);
  });

  it('retorna true quando só existem mensagens outbound no histórico', () => {
    const messages = [buildMessage({ id: 'saida-1', direction: 'outbound' })];

    expect(shouldGenerateReply(messages, 'm1')).toBe(true);
  });
});
