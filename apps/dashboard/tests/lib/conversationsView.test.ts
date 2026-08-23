import {
  mergeConversationPages,
  findConversationById,
  groupConversationsByPipelineColumn,
  reconcileConversationIdentities,
  selectWaitingConversations,
  selectUnreadConversations,
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

describe('reconcileConversationIdentities (performance, auditoria 2026-08-22)', () => {
  it('devolve o array ANTERIOR quando nada mudou — assim ate o useMemo de quem consome para de invalidar', () => {
    const previous = [buildConversation('a'), buildConversation('b')];
    // Objetos novos com o MESMO conteudo: e exatamente o que `JSON.parse` do
    // frame seguinte do SSE produz a cada ~2s.
    const next = [buildConversation('a'), buildConversation('b')];

    expect(reconcileConversationIdentities(previous, next)).toBe(previous);
  });

  it('reaproveita a referencia de cada conversa inalterada, trocando so a que mudou', () => {
    const previous = [buildConversation('a'), buildConversation('b')];
    const next = [buildConversation('a'), buildConversation('b', { unreadCount: 3 })];

    const reconciled = reconcileConversationIdentities(previous, next);

    expect(reconciled).not.toBe(previous);
    expect(reconciled[0]).toBe(previous[0]);
    expect(reconciled[1]).toBe(next[1]);
    expect(reconciled[1].unreadCount).toBe(3);
  });

  it('detecta mudanca em campo opcional que apareceu (contagem de chaves diferente)', () => {
    const previous = [buildConversation('a')];
    const next = [buildConversation('a', { escalatedAt: '2026-08-22T10:00:00.000Z' })];

    const reconciled = reconcileConversationIdentities(previous, next);

    expect(reconciled[0]).toBe(next[0]);
    expect(reconciled[0].escalatedAt).toBe('2026-08-22T10:00:00.000Z');
  });

  it('detecta mudanca de tag (unico campo nao escalar da interface)', () => {
    const previous = [
      buildConversation('a', { tags: [{ id: 't1', name: 'VIP', color: 'green' }] }),
    ];
    const next = [buildConversation('a', { tags: [{ id: 't1', name: 'VIP+', color: 'green' }] })];

    expect(reconcileConversationIdentities(previous, next)[0]).toBe(next[0]);
  });

  it('reaproveita as referencias mesmo quando a ORDEM muda (conversa nova desloca a lista)', () => {
    const previous = [buildConversation('a'), buildConversation('b')];
    const next = [buildConversation('novo'), buildConversation('a'), buildConversation('b')];

    const reconciled = reconcileConversationIdentities(previous, next);

    // Array novo (a lista de fato mudou), mas os itens antigos preservam a
    // identidade — so o item novo e um objeto novo.
    expect(reconciled).not.toBe(previous);
    expect(reconciled.map((c) => c.id)).toEqual(['novo', 'a', 'b']);
    expect(reconciled[1]).toBe(previous[0]);
    expect(reconciled[2]).toBe(previous[1]);
  });

  it('devolve o proprio `next` quando nao ha nada anterior (primeiro frame)', () => {
    const next = [buildConversation('a')];

    expect(reconcileConversationIdentities([], next)).toBe(next);
  });

  it('nao reaproveita nada quando a conversa sumiu da lista', () => {
    const previous = [buildConversation('a'), buildConversation('b')];
    const next = [buildConversation('b')];

    const reconciled = reconcileConversationIdentities(previous, next);

    expect(reconciled.map((c) => c.id)).toEqual(['b']);
    expect(reconciled[0]).toBe(previous[1]);
  });
});

describe('selectWaitingConversations (fila do dia, Onda 1 do redesign)', () => {
  it('filtra so as com escalatedAt definido', () => {
    const waiting = buildConversation('a', { escalatedAt: '2026-08-20T10:00:00.000Z' });
    const notWaiting = buildConversation('b', { escalatedAt: undefined });

    expect(selectWaitingConversations([waiting, notWaiting], 10).map((c) => c.id)).toEqual(['a']);
  });

  it('ordena pela mais ANTIGA primeiro — quem espera ha mais tempo e a mais urgente', () => {
    const recent = buildConversation('recent', { escalatedAt: '2026-08-20T12:00:00.000Z' });
    const old = buildConversation('old', { escalatedAt: '2026-08-20T08:00:00.000Z' });

    expect(selectWaitingConversations([recent, old], 10).map((c) => c.id)).toEqual([
      'old',
      'recent',
    ]);
  });

  it('respeita o limite', () => {
    const items = ['a', 'b', 'c'].map((id) =>
      buildConversation(id, { escalatedAt: '2026-08-20T10:00:00.000Z' }),
    );

    expect(selectWaitingConversations(items, 2)).toHaveLength(2);
  });
});

describe('selectUnreadConversations (fila do dia, Onda 1 do redesign)', () => {
  it('filtra so as com unreadCount > 0', () => {
    const unread = buildConversation('a', { unreadCount: 3 });
    const read = buildConversation('b', { unreadCount: 0 });

    expect(selectUnreadConversations([unread, read], 10).map((c) => c.id)).toEqual(['a']);
  });

  it('ordena pela mais RECENTE primeiro (lastMessageAt)', () => {
    const older = buildConversation('older', {
      unreadCount: 1,
      lastMessageAt: '2026-08-20T08:00:00.000Z',
    });
    const newer = buildConversation('newer', {
      unreadCount: 1,
      lastMessageAt: '2026-08-20T12:00:00.000Z',
    });

    expect(selectUnreadConversations([older, newer], 10).map((c) => c.id)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('cai para createdAt quando lastMessageAt esta ausente', () => {
    const withPreview = buildConversation('a', {
      unreadCount: 1,
      lastMessageAt: undefined,
      createdAt: '2026-08-20T09:00:00.000Z',
    });

    expect(selectUnreadConversations([withPreview], 10)).toHaveLength(1);
  });
});
