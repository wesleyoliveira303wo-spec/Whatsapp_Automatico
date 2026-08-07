import { buildSummaryPrompt } from '../../../src/services/ai/application/SummaryPromptBuilder';
import { Message } from '../../../src/services/conversations/domain/entities/Message';

function buildMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'message-1',
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    direction: 'inbound',
    content: 'Olá',
    contentType: 'text',
    occurredAt: new Date('2026-08-06T12:00:00.000Z'),
    ...overrides,
  };
}

describe('buildSummaryPrompt (Redesign 2026-08-05, R5)', () => {
  it('usa um system prompt de resumo, distinto do autoresponder', () => {
    const request = buildSummaryPrompt([buildMessage()]);

    expect(request.systemPrompt).toMatch(/resumo/i);
    expect(request.systemPrompt).toMatch(/uso interno/i);
    expect(request.systemPrompt).not.toMatch(/escalar/i);
  });

  it('mapeia inbound para user e outbound para assistant, na ordem recebida', () => {
    const messages = [
      buildMessage({ id: 'm1', direction: 'inbound', content: 'Quero saber o preço' }),
      buildMessage({ id: 'm2', direction: 'outbound', content: 'Custa R$ 100' }),
    ];

    const request = buildSummaryPrompt(messages);

    expect(request.messages).toEqual([
      { role: 'user', content: 'Quero saber o preço' },
      { role: 'assistant', content: 'Custa R$ 100' },
    ]);
  });

  it('devolve messages vazio para histórico vazio (sem lançar)', () => {
    const request = buildSummaryPrompt([]);
    expect(request.messages).toEqual([]);
  });

  it('descreve mídia sem legenda de forma factual (reusa describeMessageContent de PromptBuilder)', () => {
    const request = buildSummaryPrompt([
      buildMessage({
        contentType: 'image',
        content: '',
        media: { mimeType: 'image/jpeg', url: 'https://x', mediaKeyEncrypted: 'abc' },
      }),
    ]);

    expect(request.messages[0].content).toBe('[O cliente enviou um(a) imagem, sem legenda]');
  });

  it('descreve mídia COM legenda, preservando o texto', () => {
    const request = buildSummaryPrompt([
      buildMessage({
        contentType: 'document',
        content: 'segue o comprovante',
        media: { mimeType: 'application/pdf', url: 'https://x', mediaKeyEncrypted: 'abc' },
      }),
    ]);

    expect(request.messages[0].content).toBe(
      '[O cliente enviou um(a) documento com a legenda: "segue o comprovante"]',
    );
  });

  it('não anexa media (AiMediaContentPart) — diferente de PromptBuilder, resumo nunca é multimodal', () => {
    const request = buildSummaryPrompt([buildMessage()]);
    expect(request.messages[0]).not.toHaveProperty('media');
  });
});
