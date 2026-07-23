import { mergeConversationPages, findConversationById } from '../../lib/conversationsView';
import type { ConversationSummary } from '../../lib/clientApi';

function buildConversation(id: string, overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id,
    tenantId: 'tenant-1',
    sessionName: 'vendas',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'bot',
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('mergeConversationPages (Milestone 3, Bloco 6 - D23/D24)', () => {
  it('concatena pagina viva + paginas carregadas na ordem', () => {
    const merged = mergeConversationPages([buildConversation('a')], [[buildConversation('b')], [buildConversation('c')]]);

    expect(merged.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('dedupe por id, mantendo a PRIMEIRA ocorrencia (a versao da pagina viva vence)', () => {
    const liveVersion = buildConversation('b', { status: 'human' });
    const staleVersion = buildConversation('b', { status: 'bot' });

    const merged = mergeConversationPages([buildConversation('a'), liveVersion], [[staleVersion, buildConversation('c')]]);

    expect(merged.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(merged[1].status).toBe('human');
  });

  it('lida com pagina viva vazia (primeiro frame SSE ainda nao chegou) sem perder paginas carregadas', () => {
    const merged = mergeConversationPages([], [[buildConversation('x')]]);

    expect(merged.map((c) => c.id)).toEqual(['x']);
  });

  it('devolve lista vazia quando nao ha nada', () => {
    expect(mergeConversationPages([], [])).toEqual([]);
  });
});

describe('findConversationById', () => {
  it('encontra por id', () => {
    const target = buildConversation('b');
    expect(findConversationById([buildConversation('a'), target], 'b')).toBe(target);
  });

  it('devolve undefined quando ausente', () => {
    expect(findConversationById([buildConversation('a')], 'z')).toBeUndefined();
  });
});
