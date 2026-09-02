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
  it('retorna true quando a conversa está em modo bot, a IA da sessão está ligada e o plano permite', () => {
    expect(shouldAutoRespond(buildConversation({ status: 'bot' }), true, true)).toBe(true);
  });

  it('retorna false quando a conversa foi escalonada a um humano', () => {
    expect(shouldAutoRespond(buildConversation({ status: 'human' }), true, true)).toBe(false);
  });

  // ADR #94 (2026-08-01) — conversa fora do funil comercial nunca recebe
  // resposta automática, mesmo em status 'bot'.
  it('retorna false quando a conversa está marcada como fora do funil comercial, mesmo em modo bot', () => {
    expect(
      shouldAutoRespond(buildConversation({ status: 'bot', excludedFromPipeline: true }), true, true),
    ).toBe(false);
  });

  it('retorna false quando está fora do funil E escalonada a um humano', () => {
    expect(
      shouldAutoRespond(
        buildConversation({ status: 'human', excludedFromPipeline: true }),
        true,
        true,
      ),
    ).toBe(false);
  });

  // Fase 1 (2026-08-07) — Botão POWER.
  describe('sessionAiEnabled (Botão POWER, Fase 1/2026-08-07)', () => {
    it('retorna false quando a sessão tem a IA desligada, mesmo com a conversa em modo bot e dentro do funil', () => {
      expect(shouldAutoRespond(buildConversation({ status: 'bot' }), false, true)).toBe(false);
    });

    it('retorna false quando a IA da sessão está desligada E a conversa também está escalonada/fora do funil', () => {
      expect(
        shouldAutoRespond(
          buildConversation({ status: 'human', excludedFromPipeline: true }),
          false,
          true,
        ),
      ).toBe(false);
    });
  });

  // Lançamento suave (2026-08-31) — Trava de plano. `tenantPlanAllowsAutoReply`
  // vem de `planPermiteUso(tenant.plan)`, resolvido por quem chama (mesmo
  // padrão do `sessionAiEnabled` acima).
  describe('tenantPlanAllowsAutoReply (Trava de plano, Lançamento suave/2026-08-31)', () => {
    it('retorna false quando o plano do tenant não permite uso, mesmo com tudo o mais liberado', () => {
      expect(shouldAutoRespond(buildConversation({ status: 'bot' }), true, false)).toBe(false);
    });

    it('retorna true quando o plano permite E a conversa está em bot E a IA da sessão está ligada', () => {
      expect(shouldAutoRespond(buildConversation({ status: 'bot' }), true, true)).toBe(true);
    });

    it('retorna false quando o plano não permite E a IA da sessão também está desligada', () => {
      expect(shouldAutoRespond(buildConversation({ status: 'bot' }), false, false)).toBe(false);
    });
  });
});
