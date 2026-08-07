import { AiProviderNotSupportedError } from '../../../../src/services/ai/domain/errors/AiProviderNotSupportedError';
import { AiProviderFactoryImpl } from '../../../../src/services/ai/infrastructure/AiProviderFactoryImpl';
import { ClaudeAiProvider } from '../../../../src/services/ai/infrastructure/ClaudeAiProvider';
import { GeminiAiProvider } from '../../../../src/services/ai/infrastructure/GeminiAiProvider';

describe('AiProviderFactoryImpl', () => {
  it('create("claude") devolve uma instância de ClaudeAiProvider quando claude está configurado', () => {
    const factory = new AiProviderFactoryImpl({ claude: { apiKey: 'api-key', model: 'claude-x' } });

    expect(factory.create('claude')).toBeInstanceOf(ClaudeAiProvider);
  });

  it('create("gemini") devolve uma instância de GeminiAiProvider quando gemini está configurado', () => {
    const factory = new AiProviderFactoryImpl({
      gemini: { apiKey: 'api-key', model: 'gemini-2.5-flash' },
    });

    expect(factory.create('gemini')).toBeInstanceOf(GeminiAiProvider);
  });

  it('registra ambos os providers quando ambos estão configurados', () => {
    const factory = new AiProviderFactoryImpl({
      claude: { apiKey: 'k1', model: 'claude-x' },
      gemini: { apiKey: 'k2', model: 'gemini-2.5-flash' },
    });

    expect(factory.create('claude')).toBeInstanceOf(ClaudeAiProvider);
    expect(factory.create('gemini')).toBeInstanceOf(GeminiAiProvider);
  });

  it('devolve uma instância NOVA a cada chamada (mesmo padrão de WhatsAppProviderFactory)', () => {
    const factory = new AiProviderFactoryImpl({ claude: { apiKey: 'api-key', model: 'claude-x' } });

    expect(factory.create('claude')).not.toBe(factory.create('claude'));
  });

  it('repassa maxTokens recebido na config para o ClaudeAiProvider criado', () => {
    const factory = new AiProviderFactoryImpl({
      claude: { apiKey: 'api-key', model: 'claude-x', maxTokens: 256 },
    });

    const provider = factory.create('claude') as unknown as { maxTokens: number };

    expect(provider.maxTokens).toBe(256);
  });

  it('repassa maxTokens recebido na config para o GeminiAiProvider criado', () => {
    const factory = new AiProviderFactoryImpl({
      gemini: { apiKey: 'api-key', model: 'gemini-2.5-flash', maxTokens: 512 },
    });

    const provider = factory.create('gemini') as unknown as { maxTokens: number };

    expect(provider.maxTokens).toBe(512);
  });

  it('cria o provider sem maxTokens quando a config não o informa (usa o default do provider)', () => {
    const factory = new AiProviderFactoryImpl({ claude: { apiKey: 'api-key', model: 'claude-x' } });

    const provider = factory.create('claude') as unknown as { maxTokens: number };

    expect(provider.maxTokens).toBe(1024);
  });

  it('create() de um provider NÃO configurado lança AiProviderNotSupportedError', () => {
    const factory = new AiProviderFactoryImpl({ claude: { apiKey: 'api-key', model: 'claude-x' } });

    expect(() => factory.create('gemini')).toThrow(AiProviderNotSupportedError);
    expect(() => factory.create('gemini')).toThrow(/gemini/);
  });

  it('create("openai") lança AiProviderNotSupportedError (provider ainda não implementado, mas já previsto no tipo)', () => {
    const factory = new AiProviderFactoryImpl({ claude: { apiKey: 'api-key', model: 'claude-x' } });

    expect(() => factory.create('openai')).toThrow(AiProviderNotSupportedError);
    expect(() => factory.create('openai')).toThrow(
      'Provider de IA "openai" ainda não possui implementação registrada nesta factory.',
    );
  });
});
