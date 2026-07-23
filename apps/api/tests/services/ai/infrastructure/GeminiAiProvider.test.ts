import { GeminiAiProvider } from '../../../../src/services/ai/infrastructure/GeminiAiProvider';

/**
 * Monta um `fetch` falso que devolve uma resposta HTTP OK com o JSON informado —
 * mesmo papel do mock da SDK em `ClaudeAiProvider.test.ts`, mas sem `jest.mock`
 * de módulo: aqui o `fetch` é injetado pelo construtor (5º parâmetro).
 */
function fakeFetchOk(json: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => json,
  });
}

const GEMINI_OK_RESPONSE = {
  candidates: [{ content: { parts: [{ text: 'Olá! Como posso ajudar?' }] } }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  modelVersion: 'gemini-2.5-flash',
};

describe('GeminiAiProvider', () => {
  it('faz POST para o endpoint generateContent do modelo, com a chave no header x-goog-api-key', async () => {
    const fetchFn = fakeFetchOk(GEMINI_OK_RESPONSE);
    const provider = new GeminiAiProvider('minha-api-key', 'gemini-2.5-flash', undefined, fetchFn as unknown as typeof fetch);

    await provider.generateReply({ systemPrompt: 'Você é um assistente.', messages: [{ role: 'user', content: 'Oi' }] });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(init.method).toBe('POST');
    expect(init.headers['x-goog-api-key']).toBe('minha-api-key');
    // A chave NÃO deve vazar na URL (query param ?key=).
    expect(url).not.toContain('minha-api-key');
  });

  it('envia system_instruction, generationConfig.maxOutputTokens default e mapeia assistant->model', async () => {
    const fetchFn = fakeFetchOk(GEMINI_OK_RESPONSE);
    const provider = new GeminiAiProvider('k', 'gemini-2.5-flash', undefined, fetchFn as unknown as typeof fetch);

    await provider.generateReply({
      systemPrompt: 'Você é um assistente.',
      messages: [
        { role: 'user', content: 'Oi' },
        { role: 'assistant', content: 'Olá!' },
        { role: 'user', content: 'Tudo bem?' },
      ],
    });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.system_instruction).toEqual({ parts: [{ text: 'Você é um assistente.' }] });
    expect(body.generationConfig).toEqual({ maxOutputTokens: 1024 });
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Oi' }] },
      { role: 'model', parts: [{ text: 'Olá!' }] },
      { role: 'user', parts: [{ text: 'Tudo bem?' }] },
    ]);
  });

  it('usa o maxTokens do construtor em vez do default, quando informado', async () => {
    const fetchFn = fakeFetchOk(GEMINI_OK_RESPONSE);
    const provider = new GeminiAiProvider('k', 'gemini-2.5-flash', 256, fetchFn as unknown as typeof fetch);

    await provider.generateReply({ systemPrompt: 's', messages: [] });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.generationConfig.maxOutputTokens).toBe(256);
  });

  it('mapeia a resposta do Gemini de volta para AiGenerationResult', async () => {
    const fetchFn = fakeFetchOk(GEMINI_OK_RESPONSE);
    const provider = new GeminiAiProvider('k', 'gemini-2.5-flash', undefined, fetchFn as unknown as typeof fetch);

    const result = await provider.generateReply({ systemPrompt: 's', messages: [{ role: 'user', content: 'Oi' }] });

    expect(result).toEqual({
      content: 'Olá! Como posso ajudar?',
      model: 'gemini-2.5-flash',
      tokensInput: 10,
      tokensOutput: 5,
    });
  });

  it('concatena múltiplos parts de texto do candidato', async () => {
    const fetchFn = fakeFetchOk({
      candidates: [{ content: { parts: [{ text: 'Parte um. ' }, { text: 'Parte dois.' }] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      modelVersion: 'gemini-2.5-flash',
    });
    const provider = new GeminiAiProvider('k', 'gemini-2.5-flash', undefined, fetchFn as unknown as typeof fetch);

    const result = await provider.generateReply({ systemPrompt: 's', messages: [] });

    expect(result.content).toBe('Parte um. Parte dois.');
  });

  it('usa o model do construtor como fallback quando a resposta não traz modelVersion', async () => {
    const fetchFn = fakeFetchOk({
      candidates: [{ content: { parts: [{ text: 'oi' }] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });
    const provider = new GeminiAiProvider('k', 'gemini-2.5-flash-lite', undefined, fetchFn as unknown as typeof fetch);

    const result = await provider.generateReply({ systemPrompt: 's', messages: [] });

    expect(result.model).toBe('gemini-2.5-flash-lite');
  });

  it('devolve content vazio e zero tokens quando a resposta vem sem candidates/usage (não lança)', async () => {
    const fetchFn = fakeFetchOk({});
    const provider = new GeminiAiProvider('k', 'gemini-2.5-flash', undefined, fetchFn as unknown as typeof fetch);

    const result = await provider.generateReply({ systemPrompt: 's', messages: [] });

    expect(result).toEqual({ content: '', model: 'gemini-2.5-flash', tokensInput: 0, tokensOutput: 0 });
  });

  it('lança um erro descritivo (status + corpo) quando a API responde não-2xx', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"error":"RESOURCE_EXHAUSTED"}',
    });
    const provider = new GeminiAiProvider('k', 'gemini-2.5-flash', undefined, fetchFn as unknown as typeof fetch);

    await expect(provider.generateReply({ systemPrompt: 's', messages: [] })).rejects.toThrow(
      'Gemini API respondeu 429: {"error":"RESOURCE_EXHAUSTED"}',
    );
  });

  it('propaga um erro de rede lançado pelo fetch (não engole)', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = new GeminiAiProvider('k', 'gemini-2.5-flash', undefined, fetchFn as unknown as typeof fetch);

    await expect(provider.generateReply({ systemPrompt: 's', messages: [] })).rejects.toThrow('ECONNREFUSED');
  });
});
