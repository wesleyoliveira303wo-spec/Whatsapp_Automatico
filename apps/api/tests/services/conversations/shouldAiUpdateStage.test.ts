import { shouldAiUpdateStage } from '../../../src/services/conversations/domain/policies/shouldAiUpdateStage';
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

/**
 * REGRA ATUAL (2026-07-31, ADR #89): a IA reclassifica SEMPRE — inclusive
 * conversas já corrigidas à mão —, desde que não seja uma regressão no funil.
 * A regra anterior (ADR #84/#88) travava a IA para sempre após qualquer
 * correção humana; ver a docstring da policy para o porquê da troca.
 */
describe('shouldAiUpdateStage (pipeline de CRM — regra "só avança", ADR #89)', () => {
  describe('avanço no funil (permitido)', () => {
    it('permite avançar um estágio', () => {
      expect(shouldAiUpdateStage(buildConversation({ stage: 'new' }), 'contacted')).toBe(true);
    });

    it('permite pular estágios para frente', () => {
      expect(shouldAiUpdateStage(buildConversation({ stage: 'new' }), 'closed_won')).toBe(true);
    });

    it('permite manter o mesmo estágio (não é regressão)', () => {
      expect(shouldAiUpdateStage(buildConversation({ stage: 'negotiating' }), 'negotiating')).toBe(
        true,
      );
    });
  });

  describe('regressão no funil (bloqueada — protege a correção humana sobre PROGRESSO)', () => {
    it('bloqueia voltar de negociando para contatado', () => {
      expect(shouldAiUpdateStage(buildConversation({ stage: 'negotiating' }), 'contacted')).toBe(
        false,
      );
    });

    it('bloqueia voltar de fechado para negociando (caso clássico: negócio fechado por fora do WhatsApp)', () => {
      expect(shouldAiUpdateStage(buildConversation({ stage: 'closed_won' }), 'negotiating')).toBe(
        false,
      );
    });

    it('bloqueia voltar para o começo do funil', () => {
      expect(shouldAiUpdateStage(buildConversation({ stage: 'contacted' }), 'new')).toBe(false);
    });
  });

  describe('desfechos (closed_won/closed_lost compartilham o mesmo ponto do funil)', () => {
    it('permite corrigir Perdido para Fechado (cliente voltou atrás)', () => {
      expect(shouldAiUpdateStage(buildConversation({ stage: 'closed_lost' }), 'closed_won')).toBe(
        true,
      );
    });

    it('permite corrigir Fechado para Perdido', () => {
      expect(shouldAiUpdateStage(buildConversation({ stage: 'closed_won' }), 'closed_lost')).toBe(
        true,
      );
    });
  });

  describe('mudança de regra (ADR #89): stageSetBy NÃO trava mais a IA', () => {
    it('permite avançar mesmo numa conversa já corrigida manualmente por um humano', () => {
      const corrigidaPorHumano = buildConversation({ stage: 'contacted', stageSetBy: 'human' });
      expect(shouldAiUpdateStage(corrigidaPorHumano, 'negotiating')).toBe(true);
    });

    it('a decisão depende só da DIREÇÃO, nunca de quem classificou por último', () => {
      const porHumano = buildConversation({ stage: 'negotiating', stageSetBy: 'human' });
      const porIa = buildConversation({ stage: 'negotiating', stageSetBy: 'ai' });
      // Mesmo avanço, mesma resposta — independente de `stageSetBy`.
      expect(shouldAiUpdateStage(porHumano, 'closed_won')).toBe(
        shouldAiUpdateStage(porIa, 'closed_won'),
      );
      // Mesma regressão, mesma resposta.
      expect(shouldAiUpdateStage(porHumano, 'new')).toBe(shouldAiUpdateStage(porIa, 'new'));
    });
  });
});
