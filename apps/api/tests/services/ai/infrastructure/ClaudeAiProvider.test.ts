/**
 * Mock de `@anthropic-ai/sdk` (Milestone 3, Bloco 3a): `mockCreate` é
 * declarado DENTRO da factory de `jest.mock` (não fora, no escopo do
 * módulo) para não esbarrar na restrição do babel-plugin-jest-hoist contra
 * referenciar variáveis externas na factory. `import Anthropic from
 * '@anthropic-ai/sdk'` (default import) resolve, após a interop do
 * TypeScript, para exatamente `default` deste mock — por isso `__mockCreate`
 * é pendurado no PRÓPRIO `default` (não como irmão dele), e recuperado
 * depois do `import`, abaixo.
 */
jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn();
  const MockedAnthropic = jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } }));
  (MockedAnthropic as unknown as { __mockCreate: jest.Mock }).__mockCreate = mockCreate;
  return { __esModule: true, default: MockedAnthropic };
});

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeAiProvider } from '../../../../src/services/ai/infrastructure/ClaudeAiProvider';

const mockCreate = (Anthropic as unknown as { __mockCreate: jest.Mock }).__mockCreate;
const MockedAnthropic = Anthropic as unknown as jest.Mock;

describe('ClaudeAiProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    MockedAnthropic.mockClear();
  });

  it('constrói o client da SDK com a apiKey recebida', () => {
    // eslint-disable-next-line no-new
    new ClaudeAiProvider('minha-api-key', 'claude-x');

    expect(MockedAnthropic).toHaveBeenCalledWith({ apiKey: 'minha-api-key' });
  });

  it('chama messages.create() com model, system, messages e o max_tokens default quando nenhum é informado', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-x',
      content: [{ type: 'text', text: 'Olá! Como posso ajudar?' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const provider = new ClaudeAiProvider('minha-api-key', 'claude-x');

    await provider.generateReply({
      systemPrompt: 'Você é um assistente.',
      messages: [{ role: 'user', content: 'Oi' }],
    });

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'claude-x',
      max_tokens: 1024,
      system: 'Você é um assistente.',
      messages: [{ role: 'user', content: 'Oi' }],
    });
  });

  it('usa o maxTokens recebido no construtor em vez do default, quando informado', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-x',
      content: [{ type: 'text', text: 'Olá! Como posso ajudar?' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const provider = new ClaudeAiProvider('minha-api-key', 'claude-x', 256);

    await provider.generateReply({
      systemPrompt: 'Você é um assistente.',
      messages: [{ role: 'user', content: 'Oi' }],
    });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 256 }));
  });

  it('mapeia a resposta da SDK de volta para AiGenerationResult', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-x',
      content: [{ type: 'text', text: 'Olá! Como posso ajudar?' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const provider = new ClaudeAiProvider('minha-api-key', 'claude-x');

    const result = await provider.generateReply({
      systemPrompt: 'Você é um assistente.',
      messages: [{ role: 'user', content: 'Oi' }],
    });

    expect(result).toEqual({ content: 'Olá! Como posso ajudar?', model: 'claude-x', tokensInput: 10, tokensOutput: 5 });
  });

  it('concatena múltiplos blocos de texto e ignora blocos que não são de texto', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-x',
      content: [
        { type: 'text', text: 'Parte um. ' },
        { type: 'tool_use', id: 'x', name: 'y', input: {} },
        { type: 'text', text: 'Parte dois.' },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = new ClaudeAiProvider('minha-api-key', 'claude-x');

    const result = await provider.generateReply({ systemPrompt: 's', messages: [] });

    expect(result.content).toBe('Parte um. Parte dois.');
  });

  it('propaga um erro lançado pela SDK (não engole)', async () => {
    mockCreate.mockRejectedValue(new Error('Falha da API da Anthropic'));
    const provider = new ClaudeAiProvider('minha-api-key', 'claude-x');

    await expect(provider.generateReply({ systemPrompt: 's', messages: [] })).rejects.toThrow(
      'Falha da API da Anthropic',
    );
  });
});
