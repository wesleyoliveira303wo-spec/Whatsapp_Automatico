import { PromptBuilder } from '../../../src/services/ai/application/PromptBuilder';
import { Message } from '../../../src/services/conversations/domain/entities/Message';
import { PromptVersion } from '../../../src/services/ai/domain/PromptVersion';

function buildMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'message-1',
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    direction: 'inbound',
    content: 'Olá',
    occurredAt: new Date('2026-07-10T12:00:00.000Z'),
    ...overrides,
  };
}

const PROMPT_VERSION: PromptVersion = {
  id: 'v1',
  systemPrompt: 'Você é um assistente de atendimento.',
  createdAt: '2026-07-10',
};

describe('PromptBuilder', () => {
  it('usa o systemPrompt da PromptVersion recebida', () => {
    const builder = new PromptBuilder();

    const request = builder.build([], PROMPT_VERSION);

    expect(request.systemPrompt).toBe('Você é um assistente de atendimento.');
  });

  it('mapeia mensagens inbound para role "user" e outbound para "assistant", preservando a ordem', () => {
    const builder = new PromptBuilder();
    const messages = [
      buildMessage({ id: 'm1', direction: 'inbound', content: 'Oi, tudo bem?' }),
      buildMessage({ id: 'm2', direction: 'outbound', content: 'Tudo ótimo! Como posso ajudar?' }),
      buildMessage({ id: 'm3', direction: 'inbound', content: 'Quero saber o preço' }),
    ];

    const request = builder.build(messages, PROMPT_VERSION);

    expect(request.messages).toEqual([
      { role: 'user', content: 'Oi, tudo bem?' },
      { role: 'assistant', content: 'Tudo ótimo! Como posso ajudar?' },
      { role: 'user', content: 'Quero saber o preço' },
    ]);
  });

  it('devolve messages vazio quando não há histórico', () => {
    const builder = new PromptBuilder();

    const request = builder.build([], PROMPT_VERSION);

    expect(request.messages).toEqual([]);
  });

  // --- Base de Conhecimento (Nível 1): businessContext opcional ---

  it('mantém o systemPrompt base quando nenhum businessContext é informado (compatibilidade)', () => {
    const builder = new PromptBuilder();

    const request = builder.build([], PROMPT_VERSION);

    expect(request.systemPrompt).toBe('Você é um assistente de atendimento.');
  });

  it('anexa o businessContext ao systemPrompt base, num bloco rotulado, sem substituir o base', () => {
    const builder = new PromptBuilder();

    const request = builder.build([], PROMPT_VERSION, 'Salão da Maria. Corte R$ 50. Aberto ter-sáb, 9h-18h.');

    // O prompt base continua presente (regras de segurança preservadas)...
    expect(request.systemPrompt).toContain('Você é um assistente de atendimento.');
    // ...e o contexto do negócio é anexado num bloco rotulado.
    expect(request.systemPrompt).toContain('# Informações da empresa');
    expect(request.systemPrompt).toContain('Salão da Maria. Corte R$ 50. Aberto ter-sáb, 9h-18h.');
  });

  it('ignora um businessContext vazio ou só com espaços (não polui o prompt nem gasta tokens)', () => {
    const builder = new PromptBuilder();

    expect(builder.build([], PROMPT_VERSION, '').systemPrompt).toBe('Você é um assistente de atendimento.');
    expect(builder.build([], PROMPT_VERSION, '   \n  ').systemPrompt).toBe('Você é um assistente de atendimento.');
  });
});
