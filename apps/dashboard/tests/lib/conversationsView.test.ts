import {
  mergeConversationPages,
  findConversationById,
  groupConversationsByPipelineColumn,
} from '../../lib/conversationsView';
import type { ConversationSummary } from '../../lib/clientApi';

function buildConversation(
  id: string,
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id,
    tenantId: 'tenant-1',
    sessionName: 'vendas',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'bot',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: '2026-07-10T12:00:00.000Z',
    excludedFromPipeline: false,
    tags: [],
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('mergeConversationPages (Milestone 3, Bloco 6 - D23/D24)', () => {
  it('concatena pagina viva + paginas carregadas na ordem', () => {
    const merged = mergeConversationPages(
      [buildConversation('a')],
      [[buildConversation('b')], [buildConversation('c')]],
    );

    expect(merged.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('dedupe por id, mantendo a PRIMEIRA ocorrencia (a versao da pagina viva vence)', () => {
    const liveVersion = buildConversation('b', { status: 'human' });
    const staleVersion = buildConversation('b', { status: 'bot' });

    const merged = mergeConversationPages(
      [buildConversation('a'), liveVersion],
      [[staleVersion, buildConversation('c')]],
    );

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

describe('groupConversationsByPipelineColumn (pipeline de CRM, Milestone 6, Bloco M6H-5; coluna Não cliente na ADR #96)', () => {
  it('agrupa nas 6 colunas do board, mesmo as vazias', () => {
    const groups = groupConversationsByPipelineColumn([]);
    expect(Object.keys(groups)).toEqual([
      'new',
      'contacted',
      'negotiating',
      'closed_won',
      'closed_lost',
      'not_client',
    ]);
    expect(groups.new).toEqual([]);
    expect(groups.not_client).toEqual([]);
  });

  it('agrupa cada conversa na coluna do seu stage', () => {
    const groups = groupConversationsByPipelineColumn([
      buildConversation('a', { stage: 'new' }),
      buildConversation('b', { stage: 'negotiating' }),
      buildConversation('c', { stage: 'new' }),
    ]);

    expect(groups.new.map((c) => c.id)).toEqual(['a', 'c']);
    expect(groups.negotiating.map((c) => c.id)).toEqual(['b']);
    expect(groups.contacted).toEqual([]);
  });

  it('ordena dentro de cada coluna por stageUpdatedAt DESC (mais recente primeiro)', () => {
    const groups = groupConversationsByPipelineColumn([
      buildConversation('older', {
        stage: 'contacted',
        stageUpdatedAt: '2026-07-10T10:00:00.000Z',
      }),
      buildConversation('newer', {
        stage: 'contacted',
        stageUpdatedAt: '2026-07-10T12:00:00.000Z',
      }),
    ]);

    expect(groups.contacted.map((c) => c.id)).toEqual(['newer', 'older']);
  });

  describe('coluna "Não cliente" (ADR #96)', () => {
    it('excludedFromPipeline=true manda para not_client INDEPENDENTE do stage que carrega por baixo', () => {
      const groups = groupConversationsByPipelineColumn([
        buildConversation('amigo', { stage: 'negotiating', excludedFromPipeline: true }),
        buildConversation('lead', { stage: 'negotiating', excludedFromPipeline: false }),
      ]);

      expect(groups.not_client.map((c) => c.id)).toEqual(['amigo']);
      expect(groups.negotiating.map((c) => c.id)).toEqual(['lead']);
    });

    it('o stage por baixo é preservado no dado (sair da coluna é escolha explícita de destino)', () => {
      const groups = groupConversationsByPipelineColumn([
        buildConversation('amigo', { stage: 'closed_won', excludedFromPipeline: true }),
      ]);

      expect(groups.not_client[0].stage).toBe('closed_won');
    });

    it('ordena a coluna not_client pelo mesmo critério das demais', () => {
      const groups = groupConversationsByPipelineColumn([
        buildConversation('older', {
          excludedFromPipeline: true,
          stageUpdatedAt: '2026-07-10T10:00:00.000Z',
        }),
        buildConversation('newer', {
          excludedFromPipeline: true,
          stageUpdatedAt: '2026-07-10T12:00:00.000Z',
        }),
      ]);

      expect(groups.not_client.map((c) => c.id)).toEqual(['newer', 'older']);
    });
  });
});
