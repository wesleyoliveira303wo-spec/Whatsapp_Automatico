import { shouldAutoRespond } from '../../../src/services/conversations/domain/policies/shouldAutoRespond';
import { Conversation } from '../../../src/services/conversations/domain/entities/Conversation';

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
    stageUpdatedAt: new Date('2026-07-10T00:00:00.000Z'),
    excludedFromPipeline: false,
    archived: false,
    tags: [],
    createdAt: new Date('2026-07-10T00:00:00.000Z'),
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
    ...overrides,
  };
}

describe('shouldAutoRespond', () => {
  it('retorna true quando a conversa está em modo bot e a IA da sessão está ligada', () => {
    expect(shouldAutoRespond(buildConversation({ status: 'bot' }), true)).toBe(true);
  });

  it('retorna false quando a conversa foi escalonada a um humano', () => {
    expect(shouldAutoRespond(buildConversation({ status: 'human' }), true)).toBe(false);
  });

  // ADR #94 (2026-08-01) — conversa fora do funil comercial nunca recebe
  // resposta automática, mesmo em status 'bot'.
  it('retorna false quando a conversa está marcada como fora do funil comercial, mesmo em modo bot', () => {
    expect(
      shouldAutoRespond(buildConversation({ status: 'bot', excludedFromPipeline: true }), true),
    ).toBe(false);
  });

  it('retorna false quando está fora do funil E escalonada a um humano', () => {
    expect(
      shouldAutoRespond(buildConversation({ status: 'human', excludedFromPipeline: true }), true),
    ).toBe(false);
  });

  // Fase 1 (2026-08-07) — Botão POWER.
  describe('sessionAiEnabled (Botão POWER, Fase 1/2026-08-07)', () => {
    it('retorna false quando a sessão tem a IA desligada, mesmo com a conversa em modo bot e dentro do funil', () => {
      expect(shouldAutoRespond(buildConversation({ status: 'bot' }), false)).toBe(false);
    });

    it('retorna false quando a IA da sessão está desligada E a conversa também está escalonada/fora do funil', () => {
      expect(
        shouldAutoRespond(
          buildConversation({ status: 'human', excludedFromPipeline: true }),
          false,
        ),
      ).toBe(false);
    });
  });
});
