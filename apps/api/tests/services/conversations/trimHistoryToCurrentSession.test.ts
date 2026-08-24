import { trimHistoryToCurrentSession } from '../../../src/services/conversations/domain/policies/trimHistoryToCurrentSession';
import { Message } from '../../../src/services/conversations/domain/entities/Message';

const DAY_MS = 24 * 60 * 60 * 1000;

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

describe('trimHistoryToCurrentSession', () => {
  it('devolve o histórico inteiro quando não há nenhum gap >= o limite (conversa contínua)', () => {
    const messages = [
      buildMessage({ id: 'm1', occurredAt: new Date('2026-08-14T12:00:00.000Z') }),
      buildMessage({ id: 'm2', occurredAt: new Date('2026-08-14T12:05:00.000Z') }),
      buildMessage({ id: 'm3', occurredAt: new Date('2026-08-14T12:10:00.000Z') }),
    ];

    expect(trimHistoryToCurrentSession(messages)).toEqual(messages);
  });

  it('corta tudo antes do último gap >= 24h (cliente sumiu e voltou dias depois)', () => {
    const messages = [
      buildMessage({ id: 'm1', occurredAt: new Date('2026-08-01T12:00:00.000Z') }),
      buildMessage({ id: 'm2', occurredAt: new Date('2026-08-01T12:05:00.000Z') }),
      // Gap de 10 dias — a "sessão" antiga termina aqui.
      buildMessage({ id: 'm3', occurredAt: new Date('2026-08-11T09:00:00.000Z') }),
      buildMessage({ id: 'm4', occurredAt: new Date('2026-08-11T09:02:00.000Z') }),
    ];

    const result = trimHistoryToCurrentSession(messages);

    expect(result.map((m) => m.id)).toEqual(['m3', 'm4']);
  });

  it('usa o ÚLTIMO gap grande, não o primeiro, quando há mais de uma sessão antiga no histórico', () => {
    const messages = [
      buildMessage({ id: 'm1', occurredAt: new Date('2026-08-01T12:00:00.000Z') }),
      // Gap de 5 dias (1ª sessão antiga encerra).
      buildMessage({ id: 'm2', occurredAt: new Date('2026-08-06T12:00:00.000Z') }),
      // Gap de 5 dias (2ª sessão antiga encerra) — este é o ÚLTIMO gap grande.
      buildMessage({ id: 'm3', occurredAt: new Date('2026-08-11T12:00:00.000Z') }),
      buildMessage({ id: 'm4', occurredAt: new Date('2026-08-11T12:03:00.000Z') }),
    ];

    const result = trimHistoryToCurrentSession(messages);

    expect(result.map((m) => m.id)).toEqual(['m3', 'm4']);
  });

  it('um gap logo ABAIXO do limite (23h59min) NÃO corta — é uma conversa contínua, só demorada', () => {
    const messages = [
      buildMessage({ id: 'm1', occurredAt: new Date('2026-08-10T12:00:00.000Z') }),
      buildMessage({
        id: 'm2',
        occurredAt: new Date(new Date('2026-08-10T12:00:00.000Z').getTime() + DAY_MS - 60_000),
      }),
    ];

    expect(trimHistoryToCurrentSession(messages).map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('um gap de EXATAMENTE 24h corta (limite é inclusivo, >=)', () => {
    const messages = [
      buildMessage({ id: 'm1', occurredAt: new Date('2026-08-10T12:00:00.000Z') }),
      buildMessage({
        id: 'm2',
        occurredAt: new Date(new Date('2026-08-10T12:00:00.000Z').getTime() + DAY_MS),
      }),
    ];

    expect(trimHistoryToCurrentSession(messages).map((m) => m.id)).toEqual(['m2']);
  });

  it('respeita um limite customizado (sessionGapMs), não só o default de 24h', () => {
    const oneHourMs = 60 * 60 * 1000;
    const messages = [
      buildMessage({ id: 'm1', occurredAt: new Date('2026-08-10T12:00:00.000Z') }),
      // Gap de 2h — corta com limite de 1h, não corta com o default de 24h.
      buildMessage({ id: 'm2', occurredAt: new Date('2026-08-10T14:00:00.000Z') }),
    ];

    expect(trimHistoryToCurrentSession(messages, oneHourMs).map((m) => m.id)).toEqual(['m2']);
    expect(trimHistoryToCurrentSession(messages).map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(trimHistoryToCurrentSession([])).toEqual([]);
  });

  it('uma única mensagem devolve ela mesma, sem tentar comparar consigo própria', () => {
    const messages = [buildMessage({ id: 'm1' })];

    expect(trimHistoryToCurrentSession(messages)).toEqual(messages);
  });
});
