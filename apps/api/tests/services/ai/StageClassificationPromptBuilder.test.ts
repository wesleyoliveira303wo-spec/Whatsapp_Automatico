import { Message } from '../../../src/services/conversations/domain/entities/Message';
import { buildStageClassificationPrompt } from '../../../src/services/ai/application/StageClassificationPromptBuilder';

function message(direction: Message['direction'], content: string): Message {
  return {
    id: `${direction}-${content}`,
    tenantId: 't1',
    conversationId: 'c1',
    direction,
    content,
    contentType: 'text',
    occurredAt: new Date('2026-09-11T10:00:00Z'),
    createdAt: new Date('2026-09-11T10:00:00Z'),
  } as Message;
}

describe('buildStageClassificationPrompt', () => {
  it('manda a conversa como UMA mensagem de usuário com a transcrição rotulada', () => {
    const request = buildStageClassificationPrompt(
      [message('inbound', 'Quanto custa?'), message('outbound', 'R$ 990, à vista no pix')],
      'contacted',
    );

    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].role).toBe('user');
    expect(request.messages[0].content).toContain('Estágio atual no funil: CONTACTED');
    expect(request.messages[0].content).toContain('Cliente: Quanto custa?');
    expect(request.messages[0].content).toContain('Empresa: R$ 990, à vista no pix');
  });

  it('pede a saída no MESMO formato do marcador do autoresponder', () => {
    const request = buildStageClassificationPrompt([message('inbound', 'oi')], 'new');

    expect(request.systemPrompt).toContain('[[ESTAGIO:');
    for (const stage of ['NEW', 'CONTACTED', 'NEGOTIATING', 'CLOSED_WON', 'CLOSED_LOST']) {
      expect(request.systemPrompt).toContain(stage);
    }
  });
});
