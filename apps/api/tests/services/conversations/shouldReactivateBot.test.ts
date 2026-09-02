import { Conversation } from '../../../src/services/conversations/domain/entities/Conversation';
import {
  DEFAULT_BOT_REACTIVATION_SILENCE_MS,
  isWaitingForHumanUnowned,
  shouldReactivateBot,
} from '../../../src/services/conversations/domain/policies/shouldReactivateBot';

function buildConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-1',
    tenantId: 'tenant-1',
    sessionName: 'default',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'human',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: new Date('2026-07-10T10:00:00.000Z'),
    excludedFromPipeline: false,
    archived: false,
    tags: [],
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
    updatedAt: new Date('2026-07-10T10:00:00.000Z'),
    ...overrides,
  };
}

const NOW = new Date('2026-07-10T12:00:00.000Z');

describe('isWaitingForHumanUnowned', () => {
  it('true para conversa em human sem dono', () => {
    expect(
      isWaitingForHumanUnowned(buildConversation({ status: 'human', assignedToUserId: undefined })),
    ).toBe(true);
  });

  it('false para conversa em human COM dono (humano atendendo)', () => {
    expect(
      isWaitingForHumanUnowned(buildConversation({ status: 'human', assignedToUserId: 'user-1' })),
    ).toBe(false);
  });

  it('false para conversa em bot', () => {
    expect(isWaitingForHumanUnowned(buildConversation({ status: 'bot' }))).toBe(false);
  });
});

describe('shouldReactivateBot', () => {
  it('true quando aguardando humano sem dono e silêncio >= limite (30 min)', () => {
    const lastActivity = new Date(NOW.getTime() - DEFAULT_BOT_REACTIVATION_SILENCE_MS);
    expect(shouldReactivateBot(buildConversation(), NOW, lastActivity)).toBe(true);
  });

  it('true na fronteira exata do limite (>=)', () => {
    const lastActivity = new Date(NOW.getTime() - DEFAULT_BOT_REACTIVATION_SILENCE_MS);
    expect(
      shouldReactivateBot(
        buildConversation(),
        NOW,
        lastActivity,
        DEFAULT_BOT_REACTIVATION_SILENCE_MS,
      ),
    ).toBe(true);
  });

  it('false quando o silêncio foi menor que o limite', () => {
    const lastActivity = new Date(NOW.getTime() - 15 * 60 * 1000); // 15 min
    expect(shouldReactivateBot(buildConversation(), NOW, lastActivity)).toBe(false);
  });

  it('false quando um humano assumiu (com dono), mesmo com silêncio longo', () => {
    const lastActivity = new Date(NOW.getTime() - 3 * 60 * 60 * 1000); // 3 h
    expect(
      shouldReactivateBot(buildConversation({ assignedToUserId: 'user-1' }), NOW, lastActivity),
    ).toBe(false);
  });

  it('false quando a conversa está em bot (nada a reativar)', () => {
    const lastActivity = new Date(NOW.getTime() - 3 * 60 * 60 * 1000);
    expect(shouldReactivateBot(buildConversation({ status: 'bot' }), NOW, lastActivity)).toBe(
      false,
    );
  });

  it('respeita um limite customizado', () => {
    const lastActivity = new Date(NOW.getTime() - 10 * 60 * 1000); // 10 min
    // Limite de 5 min: 10 min de silêncio já reativa.
    expect(shouldReactivateBot(buildConversation(), NOW, lastActivity, 5 * 60 * 1000)).toBe(true);
    // Limite de 20 min: 10 min ainda não reativa.
    expect(shouldReactivateBot(buildConversation(), NOW, lastActivity, 20 * 60 * 1000)).toBe(false);
  });
});
