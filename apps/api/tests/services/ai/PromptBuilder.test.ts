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
    // Fase 1, Bloco F1.1 (ADR #90): campo novo obrigatório.
    contentType: 'text',
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

  // --- Fase 1, Bloco F1.1 (ADR #90): mensagens de mídia no histórico ---
  describe('mensagens de mídia (nenhum AiProvider é multimodal)', () => {
    it('descreve uma imagem sem legenda como um aviso factual entre colchetes', () => {
      const builder = new PromptBuilder();
      const messages = [
        buildMessage({
          contentType: 'image',
          content: '',
          media: { mimeType: 'image/jpeg', url: 'https://x.enc', mediaKeyEncrypted: 'enc:abc' },
        }),
      ];

      const request = builder.build(messages, PROMPT_VERSION);

      expect(request.messages).toEqual([
        { role: 'user', content: '[O cliente enviou um(a) imagem, sem legenda]' },
      ]);
    });

    it('preserva a legenda quando a mídia tem uma', () => {
      const builder = new PromptBuilder();
      const messages = [
        buildMessage({
          contentType: 'image',
          content: 'Segue o comprovante',
          media: { mimeType: 'image/jpeg', url: 'https://x.enc', mediaKeyEncrypted: 'enc:abc' },
        }),
      ];

      const request = builder.build(messages, PROMPT_VERSION);

      expect(request.messages).toEqual([
        {
          role: 'user',
          content: '[O cliente enviou um(a) imagem com a legenda: "Segue o comprovante"]',
        },
      ]);
    });

    it.each([
      ['audio', 'áudio'],
      ['video', 'vídeo'],
      ['document', 'documento'],
      ['sticker', 'figurinha'],
    ] as const)('descreve %s como "%s"', (contentType, label) => {
      const builder = new PromptBuilder();
      const messages = [
        buildMessage({
          contentType,
          content: '',
          media: {
            mimeType: 'application/octet-stream',
            url: 'https://x.enc',
            mediaKeyEncrypted: 'enc:abc',
          },
        }),
      ];

      const request = builder.build(messages, PROMPT_VERSION);

      expect(request.messages).toEqual([
        { role: 'user', content: `[O cliente enviou um(a) ${label}, sem legenda]` },
      ]);
    });

    it('trata contentType de mídia sem media (dado inconsistente) como o content cru, sem quebrar', () => {
      const builder = new PromptBuilder();
      const messages = [
        buildMessage({ contentType: 'image', content: 'texto qualquer', media: undefined }),
      ];

      const request = builder.build(messages, PROMPT_VERSION);

      expect(request.messages).toEqual([{ role: 'user', content: 'texto qualquer' }]);
    });

    it('não altera mensagens de texto (comportamento pré-F1.1 inalterado)', () => {
      const builder = new PromptBuilder();
      const messages = [buildMessage({ contentType: 'text', content: 'Oi, tudo bem?' })];

      const request = builder.build(messages, PROMPT_VERSION);

      expect(request.messages).toEqual([{ role: 'user', content: 'Oi, tudo bem?' }]);
    });
  });

  // --- Fase 1, Bloco F1.2: interpretação de mídia (binário já baixado) ---
  describe('mediaByMessageId (Bloco F1.2 — binário anexado a uma mensagem específica)', () => {
    it('anexa media à mensagem cujo id está no mapa', () => {
      const builder = new PromptBuilder();
      const messages = [
        buildMessage({ id: 'm1', contentType: 'text', content: 'Oi' }),
        buildMessage({
          id: 'm2',
          contentType: 'image',
          content: '',
          media: { mimeType: 'image/jpeg', url: 'https://x.enc', mediaKeyEncrypted: 'enc:abc' },
        }),
      ];
      const mediaByMessageId = new Map([['m2', { mimeType: 'image/jpeg', data: 'YmFzZTY0' }]]);

      const request = builder.build(messages, PROMPT_VERSION, undefined, mediaByMessageId);

      expect(request.messages).toEqual([
        { role: 'user', content: 'Oi', media: undefined },
        {
          role: 'user',
          content: '[O cliente enviou um(a) imagem, sem legenda]',
          media: { mimeType: 'image/jpeg', data: 'YmFzZTY0' },
        },
      ]);
    });

    it('sem mediaByMessageId (parâmetro ausente): nenhuma mensagem ganha media, comportamento idêntico ao pré-F1.2', () => {
      const builder = new PromptBuilder();
      const messages = [buildMessage({ id: 'm1', contentType: 'text', content: 'Oi' })];

      const request = builder.build(messages, PROMPT_VERSION);

      expect(request.messages).toEqual([{ role: 'user', content: 'Oi', media: undefined }]);
    });

    it('mapa vazio: comportamento idêntico a mapa ausente', () => {
      const builder = new PromptBuilder();
      const messages = [buildMessage({ id: 'm1', contentType: 'text', content: 'Oi' })];

      const request = builder.build(messages, PROMPT_VERSION, undefined, new Map());

      expect(request.messages).toEqual([{ role: 'user', content: 'Oi', media: undefined }]);
    });

    it('id presente no mapa mas mensagem não existe no histórico: sem efeito (nenhum crash)', () => {
      const builder = new PromptBuilder();
      const messages = [buildMessage({ id: 'm1', contentType: 'text', content: 'Oi' })];
      const mediaByMessageId = new Map([['m-inexistente', { mimeType: 'image/jpeg', data: 'x' }]]);

      const request = builder.build(messages, PROMPT_VERSION, undefined, mediaByMessageId);

      expect(request.messages).toEqual([{ role: 'user', content: 'Oi', media: undefined }]);
    });
  });

  // --- Base de Conhecimento (Nível 1): businessContext opcional ---

  it('mantém o systemPrompt base quando nenhum businessContext é informado (compatibilidade)', () => {
    const builder = new PromptBuilder();

    const request = builder.build([], PROMPT_VERSION);

    expect(request.systemPrompt).toBe('Você é um assistente de atendimento.');
  });

  it('anexa o businessContext ao systemPrompt base, num bloco rotulado, sem substituir o base', () => {
    const builder = new PromptBuilder();

    const request = builder.build(
      [],
      PROMPT_VERSION,
      'Salão da Maria. Corte R$ 50. Aberto ter-sáb, 9h-18h.',
    );

    // O prompt base continua presente (regras de segurança preservadas)...
    expect(request.systemPrompt).toContain('Você é um assistente de atendimento.');
    // ...e o contexto do negócio é anexado num bloco rotulado.
    expect(request.systemPrompt).toContain('# Informações da empresa');
    expect(request.systemPrompt).toContain('Salão da Maria. Corte R$ 50. Aberto ter-sáb, 9h-18h.');
  });

  it('ignora um businessContext vazio ou só com espaços (não polui o prompt nem gasta tokens)', () => {
    const builder = new PromptBuilder();

    expect(builder.build([], PROMPT_VERSION, '').systemPrompt).toBe(
      'Você é um assistente de atendimento.',
    );
    expect(builder.build([], PROMPT_VERSION, '   \n  ').systemPrompt).toBe(
      'Você é um assistente de atendimento.',
    );
  });

  // --- F1.8: offHoursContext (5º parâmetro) ---

  it('F1.8: injeta o offHoursContext ao final do systemPrompt quando informado', () => {
    const builder = new PromptBuilder();
    const offHoursContext = '# Aviso de Horário\nEstamos fora do horário. Responda brevemente.';

    const request = builder.build([], PROMPT_VERSION, undefined, undefined, offHoursContext);

    expect(request.systemPrompt).toContain('Você é um assistente de atendimento.');
    expect(request.systemPrompt).toContain('# Aviso de Horário');
    expect(request.systemPrompt).toContain('Estamos fora do horário. Responda brevemente.');
  });

  it('F1.8: offHoursContext vem APÓS businessContext quando ambos estão presentes', () => {
    const builder = new PromptBuilder();
    const businessContext = 'Salão da Maria.';
    const offHoursContext = '# Aviso de Horário\nFora do expediente.';

    const request = builder.build([], PROMPT_VERSION, businessContext, undefined, offHoursContext);

    const prompt = request.systemPrompt;
    // Ambos presentes
    expect(prompt).toContain('Salão da Maria.');
    expect(prompt).toContain('Fora do expediente.');
    // Off-hours vem depois do business context
    expect(prompt.indexOf('Salão da Maria.')).toBeLessThan(prompt.indexOf('Fora do expediente.'));
  });

  it('F1.8: offHoursContext ausente (undefined) não altera o systemPrompt', () => {
    const builder = new PromptBuilder();

    const withOffHours = builder.build([], PROMPT_VERSION, undefined, undefined, undefined);
    const withoutOffHours = builder.build([], PROMPT_VERSION);

    expect(withOffHours.systemPrompt).toBe(withoutOffHours.systemPrompt);
  });

  // --- Fase L, Bloco L6: campaignContext (6º parâmetro) ---

  it('L6: injeta o campaignContext ao final do systemPrompt quando informado', () => {
    const builder = new PromptBuilder();
    const campaignContext = '# Origem desta conversa\nNós procuramos o lead primeiro.';

    const request = builder.build(
      [],
      PROMPT_VERSION,
      undefined,
      undefined,
      undefined,
      campaignContext,
    );

    expect(request.systemPrompt).toContain('Você é um assistente de atendimento.');
    expect(request.systemPrompt).toContain('# Origem desta conversa');
    expect(request.systemPrompt).toContain('Nós procuramos o lead primeiro.');
  });

  it('L6: campaignContext vem APÓS businessContext e offHoursContext quando todos presentes', () => {
    const builder = new PromptBuilder();
    const businessContext = 'Salão da Maria.';
    const offHoursContext = '# Aviso de Horário\nFora do expediente.';
    const campaignContext = '# Origem desta conversa\nNós procuramos o lead primeiro.';

    const request = builder.build(
      [],
      PROMPT_VERSION,
      businessContext,
      undefined,
      offHoursContext,
      campaignContext,
    );

    const prompt = request.systemPrompt;
    expect(prompt.indexOf('Salão da Maria.')).toBeLessThan(prompt.indexOf('Fora do expediente.'));
    expect(prompt.indexOf('Fora do expediente.')).toBeLessThan(
      prompt.indexOf('Nós procuramos o lead primeiro.'),
    );
  });

  it('L6: campaignContext ausente (undefined) não altera o systemPrompt', () => {
    const builder = new PromptBuilder();

    const withCampaign = builder.build(
      [],
      PROMPT_VERSION,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    const withoutCampaign = builder.build([], PROMPT_VERSION);

    expect(withCampaign.systemPrompt).toBe(withoutCampaign.systemPrompt);
  });
});
