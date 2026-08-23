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
    const provider = new GeminiAiProvider(
      'minha-api-key',
      'gemini-2.5-flash',
      undefined,
      fetchFn as unknown as typeof fetch,
    );

    await provider.generateReply({
      systemPrompt: 'Você é um assistente.',
      messages: [{ role: 'user', content: 'Oi' }],
    });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    );
    expect(init.method).toBe('POST');
    expect(init.headers['x-goog-api-key']).toBe('minha-api-key');
    // A chave NÃO deve vazar na URL (query param ?key=).
    expect(url).not.toContain('minha-api-key');
  });

  it('envia system_instruction, generationConfig.maxOutputTokens default e mapeia assistant->model', async () => {
    const fetchFn = fakeFetchOk(GEMINI_OK_RESPONSE);
    const provider = new GeminiAiProvider(
      'k',
      'gemini-2.5-flash',
      undefined,
      fetchFn as unknown as typeof fetch,
    );

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
    // NOTA (2026-07-31): `thinkingConfig` foi adicionado e depois REVERTIDO
    // (ver comentário em `GeminiAiProvider.generateReply`) — a hipótese que o
    // motivou foi refutada, e o fundador optou por preservar o raciocínio
    // padrão do modelo. `generationConfig` volta a ter só `maxOutputTokens`.
    expect(body.generationConfig).toEqual({ maxOutputTokens: 1024 });
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Oi' }] },
      { role: 'model', parts: [{ text: 'Olá!' }] },
      { role: 'user', parts: [{ text: 'Tudo bem?' }] },
    ]);
  });

  it('Fase 1, Bloco F1.2: anexa um segundo part inline_data quando a mensagem carrega media (base64)', async () => {
    const fetchFn = fakeFetchOk(GEMINI_OK_RESPONSE);
    const provider = new GeminiAiProvider(
      'k',
      'gemini-2.5-flash',
      undefined,
      fetchFn as unknown as typeof fetch,
    );

    await provider.generateReply({
      systemPrompt: 's',
      messages: [
        { role: 'user', content: 'Oi' },
        {
          role: 'user',
          content: '[O cliente enviou um(a) imagem, sem legenda]',
          media: { mimeType: 'image/jpeg', data: 'YmFzZTY0' },
        },
      ],
    });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Oi' }] },
      {
        role: 'user',
        parts: [
          { text: '[O cliente enviou um(a) imagem, sem legenda]' },
          { inline_data: { mime_type: 'image/jpeg', data: 'YmFzZTY0' } },
        ],
      },
    ]);
  });

  it('usa o maxTokens do construtor em vez do default, quando informado', async () => {
    const fetchFn = fakeFetchOk(GEMINI_OK_RESPONSE);
    const provider = new GeminiAiProvider(
      'k',
      'gemini-2.5-flash',
      256,
      fetchFn as unknown as typeof fetch,
    );

    await provider.generateReply({ systemPrompt: 's', messages: [] });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.generationConfig.maxOutputTokens).toBe(256);
  });

  it('mapeia a resposta do Gemini de volta para AiGenerationResult', async () => {
    const fetchFn = fakeFetchOk(GEMINI_OK_RESPONSE);
    const provider = new GeminiAiProvider(
      'k',
      'gemini-2.5-flash',
      undefined,
      fetchFn as unknown as typeof fetch,
    );

    const result = await provider.generateReply({
      systemPrompt: 's',
      messages: [{ role: 'user', content: 'Oi' }],
    });

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
    const provider = new GeminiAiProvider(
      'k',
      'gemini-2.5-flash',
      undefined,
      fetchFn as unknown as typeof fetch,
    );

    const result = await provider.generateReply({ systemPrompt: 's', messages: [] });

    expect(result.content).toBe('Parte um. Parte dois.');
  });

  it('correção 2026-08-18: NUNCA inclui um part marcado thought:true (raciocínio interno) na resposta ao cliente', async () => {
    const fetchFn = fakeFetchOk({
      candidates: [
        {
          content: {
            parts: [
              { text: 'but they already sent text, it might look stupid.', thought: true },
              { text: 'Fala! Bom dia! Tudo bem por aí? Como posso te ajudar hoje?' },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      modelVersion: 'gemini-3.5-flash',
    });
    const provider = new GeminiAiProvider(
      'k',
      'gemini-3.5-flash',
      undefined,
      fetchFn as unknown as typeof fetch,
    );

    const result = await provider.generateReply({ systemPrompt: 's', messages: [] });

    expect(result.content).toBe('Fala! Bom dia! Tudo bem por aí? Como posso te ajudar hoje?');
    expect(result.content).not.toMatch(/thought|might look stupid/i);
  });

  it('usa o model do construtor como fallback quando a resposta não traz modelVersion', async () => {
    const fetchFn = fakeFetchOk({
      candidates: [{ content: { parts: [{ text: 'oi' }] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });
    const provider = new GeminiAiProvider(
      'k',
      'gemini-2.5-flash-lite',
      undefined,
      fetchFn as unknown as typeof fetch,
    );

    const result = await provider.generateReply({ systemPrompt: 's', messages: [] });

    expect(result.model).toBe('gemini-2.5-flash-lite');
  });

  it('devolve content vazio e zero tokens quando a resposta vem sem candidates/usage (não lança)', async () => {
    const fetchFn = fakeFetchOk({});
    const provider = new GeminiAiProvider(
      'k',
      'gemini-2.5-flash',
      undefined,
      fetchFn as unknown as typeof fetch,
    );

    const result = await provider.generateReply({ systemPrompt: 's', messages: [] });

    expect(result).toEqual({
      content: '',
      model: 'gemini-2.5-flash',
      tokensInput: 0,
      tokensOutput: 0,
    });
  });

  describe('correção 2026-07-30: diagnóstico de resposta cortada por MAX_TOKENS', () => {
    function fakeLogger(): { info: jest.Mock; warn: jest.Mock; child: jest.Mock } {
      const info = jest.fn();
      const warn = jest.fn();
      const child = jest.fn();
      child.mockReturnValue({ debug: jest.fn(), info, warn, error: jest.fn(), child });
      return { info, warn, child };
    }

    it('loga um warn quando finishReason é MAX_TOKENS, mas ainda devolve o conteúdo parcial (não lança)', async () => {
      const logger = fakeLogger();
      const fetchFn = fakeFetchOk({
        candidates: [
          { content: { parts: [{ text: 'Resposta cortada' }] }, finishReason: 'MAX_TOKENS' },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 1024,
          thoughtsTokenCount: 900,
        },
        modelVersion: 'gemini-3.5-flash',
      });
      const provider = new GeminiAiProvider(
        'k',
        'gemini-3.5-flash',
        undefined,
        fetchFn as unknown as typeof fetch,
        undefined,
        {},
        logger as never,
      );

      const result = await provider.generateReply({ systemPrompt: 's', messages: [] });

      expect(result.content).toBe('Resposta cortada');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('MAX_TOKENS'),
        expect.objectContaining({ model: 'gemini-3.5-flash', thoughtsTokenCount: 900 }),
      );
    });

    it('não loga nada quando finishReason é STOP (caso normal)', async () => {
      const logger = fakeLogger();
      const fetchFn = fakeFetchOk({
        candidates: [{ content: { parts: [{ text: 'Resposta completa' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        modelVersion: 'gemini-3.5-flash',
      });
      const provider = new GeminiAiProvider(
        'k',
        'gemini-3.5-flash',
        undefined,
        fetchFn as unknown as typeof fetch,
        undefined,
        {},
        logger as never,
      );

      await provider.generateReply({ systemPrompt: 's', messages: [] });

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('funciona sem logger algum (parâmetro opcional) — não lança mesmo com MAX_TOKENS', async () => {
      const fetchFn = fakeFetchOk({
        candidates: [
          { content: { parts: [{ text: 'Resposta cortada' }] }, finishReason: 'MAX_TOKENS' },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1024 },
        modelVersion: 'gemini-3.5-flash',
      });
      const provider = new GeminiAiProvider(
        'k',
        'gemini-3.5-flash',
        undefined,
        fetchFn as unknown as typeof fetch,
      );

      await expect(provider.generateReply({ systemPrompt: 's', messages: [] })).resolves.toEqual(
        expect.objectContaining({ content: 'Resposta cortada' }),
      );
    });
  });

  it('lança um erro descritivo (status + corpo) quando a API responde não-2xx (429, NÃO retryable — sem retentativa)', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"error":"RESOURCE_EXHAUSTED"}',
    });
    const provider = new GeminiAiProvider(
      'k',
      'gemini-2.5-flash',
      undefined,
      fetchFn as unknown as typeof fetch,
    );

    await expect(provider.generateReply({ systemPrompt: 's', messages: [] })).rejects.toThrow(
      'Gemini API respondeu 429: {"error":"RESOURCE_EXHAUSTED"}',
    );
    // Cota diária não se resolve em segundos — nenhuma retentativa.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('propaga um erro de rede lançado pelo fetch (não engole), sem retry quando maxRetries=0', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = new GeminiAiProvider(
      'k',
      'gemini-2.5-flash',
      undefined,
      fetchFn as unknown as typeof fetch,
      undefined,
      {
        maxRetries: 0,
      },
    );

    await expect(provider.generateReply({ systemPrompt: 's', messages: [] })).rejects.toThrow(
      'ECONNREFUSED',
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  describe('retry em erro transitório (23/07/2026 — 503 "high demand" no teste real)', () => {
    function fakeSleep(): { fn: jest.Mock; calls: number[] } {
      const calls: number[] = [];
      const fn = jest.fn(async (ms: number) => {
        calls.push(ms);
      });
      return { fn, calls };
    }

    it('503 na 1ª tentativa, sucesso na 2ª: retenta e devolve a resposta (sem propagar o erro)', async () => {
      const { fn: sleepFn } = fakeSleep();
      const fetchFn = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'high demand' })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => GEMINI_OK_RESPONSE });
      const provider = new GeminiAiProvider(
        'k',
        'gemini-2.5-flash',
        undefined,
        fetchFn as unknown as typeof fetch,
        undefined,
        {
          sleepFn,
        },
      );

      const result = await provider.generateReply({ systemPrompt: 's', messages: [] });

      expect(result.content).toBe('Olá! Como posso ajudar?');
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(sleepFn).toHaveBeenCalledWith(2000); // default retryDelayMs
    });

    it('503 em todas as tentativas: esgota o maxRetries configurado e propaga o erro', async () => {
      const { fn: sleepFn } = fakeSleep();
      const fetchFn = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 503, text: async () => 'high demand' });
      const provider = new GeminiAiProvider(
        'k',
        'gemini-2.5-flash',
        undefined,
        fetchFn as unknown as typeof fetch,
        undefined,
        {
          maxRetries: 2,
          sleepFn,
        },
      );

      await expect(provider.generateReply({ systemPrompt: 's', messages: [] })).rejects.toThrow(
        'Gemini API respondeu 503: high demand',
      );
      // 1ª tentativa + 2 retentativas = 3 chamadas ao fetch; 2 esperas entre elas.
      expect(fetchFn).toHaveBeenCalledTimes(3);
      expect(sleepFn).toHaveBeenCalledTimes(2);
    });

    it('backoff exponencial (2026-07-31): a espera DOBRA a cada retentativa (2s, 4s, 8s...)', async () => {
      const { fn: sleepFn, calls } = fakeSleep();
      const fetchFn = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 503, text: async () => 'high demand' });
      const provider = new GeminiAiProvider(
        'k',
        'gemini-2.5-flash',
        undefined,
        fetchFn as unknown as typeof fetch,
        undefined,
        {
          maxRetries: 3,
          sleepFn,
        },
      );

      await expect(provider.generateReply({ systemPrompt: 's', messages: [] })).rejects.toThrow();

      expect(calls).toEqual([2000, 4000, 8000]);
    });

    it('erro de rede (fetch lança, sem resposta HTTP): também retenta por padrão e pode se recuperar', async () => {
      const { fn: sleepFn } = fakeSleep();
      const fetchFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => GEMINI_OK_RESPONSE });
      const provider = new GeminiAiProvider(
        'k',
        'gemini-2.5-flash',
        undefined,
        fetchFn as unknown as typeof fetch,
        undefined,
        {
          sleepFn,
        },
      );

      const result = await provider.generateReply({ systemPrompt: 's', messages: [] });

      expect(result.content).toBe('Olá! Como posso ajudar?');
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('404 (modelo inexistente): NÃO retenta, propaga imediatamente', async () => {
      const { fn: sleepFn } = fakeSleep();
      const fetchFn = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'model not found',
      });
      const provider = new GeminiAiProvider(
        'k',
        'gemini-inexistente',
        undefined,
        fetchFn as unknown as typeof fetch,
        undefined,
        {
          sleepFn,
        },
      );

      await expect(provider.generateReply({ systemPrompt: 's', messages: [] })).rejects.toThrow(
        'Gemini API respondeu 404: model not found',
      );
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(sleepFn).not.toHaveBeenCalled();
    });
  });
});
