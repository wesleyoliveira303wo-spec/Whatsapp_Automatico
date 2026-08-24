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
  // Título ATUALIZADO (2026-08-24): `GeminiAiProvider` É multimodal desde
  // F1.2 — a claim antiga de "nenhum provider é multimodal" ficou
  // desatualizada. `describeMessageContent` é o fallback textual, usado
  // sempre que não há binário anexado (ou o provider não é multimodal).
  describe('mensagens de mídia (descrição textual — fallback quando não há binário anexado)', () => {
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

    // CORREÇÃO 2026-08-21 — bug MEDIDO em produção: a descrição era fixa em
    // "O cliente enviou", ignorando `direction`. Numa conversa de campanha com
    // anexo, a mensagem de abertura é NOSSA e é uma imagem, então a IA lia o
    // próprio turno dela (`role: 'assistant'`) afirmando que o CLIENTE tinha
    // mandado uma imagem — e abria a conversa perguntando sobre uma imagem
    // inexistente ("Não mandei imagem!", resposta real de um cliente).
    describe('direção da mídia (correção 2026-08-21)', () => {
      it('descreve mídia OUTBOUND na primeira pessoa, nunca como se o cliente tivesse enviado', () => {
        const builder = new PromptBuilder();
        const messages = [
          buildMessage({
            direction: 'outbound',
            contentType: 'image',
            content: 'Olá! me chamo Wesley Francis.',
            media: { mimeType: 'image/jpeg', url: '', mediaKeyEncrypted: '' },
          }),
        ];

        const request = builder.build(messages, PROMPT_VERSION);

        expect(request.messages).toEqual([
          {
            role: 'assistant',
            content: '[Você enviou um(a) imagem com a legenda: "Olá! me chamo Wesley Francis."]',
          },
        ]);
        expect(request.messages[0].content).not.toContain('O cliente enviou');
      });

      it('descreve mídia OUTBOUND sem legenda também na primeira pessoa', () => {
        const builder = new PromptBuilder();
        const messages = [
          buildMessage({
            direction: 'outbound',
            contentType: 'document',
            content: '',
            media: { mimeType: 'application/pdf', url: '', mediaKeyEncrypted: '' },
          }),
        ];

        const request = builder.build(messages, PROMPT_VERSION);

        expect(request.messages[0].content).toBe('[Você enviou um(a) documento, sem legenda]');
      });

      it('mídia INBOUND continua descrita como "O cliente enviou" (sem regressão)', () => {
        const builder = new PromptBuilder();
        const messages = [
          buildMessage({
            direction: 'inbound',
            contentType: 'image',
            content: '',
            media: { mimeType: 'image/jpeg', url: 'https://x.enc', mediaKeyEncrypted: 'enc:abc' },
          }),
        ];

        const request = builder.build(messages, PROMPT_VERSION);

        expect(request.messages[0].content).toBe('[O cliente enviou um(a) imagem, sem legenda]');
      });
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

    // Feature de transcrição de áudio (2026-08-24) — ver
    // `audioTranscriptSignal.ts`/`ConversationAiService.persistAudioTranscript`.
    describe('transcrição de áudio (feature de transcrição de áudio, 2026-08-24)', () => {
      it('áudio INBOUND já transcrito usa a transcrição real, não a descrição genérica', () => {
        const builder = new PromptBuilder();
        const messages = [
          buildMessage({
            direction: 'inbound',
            contentType: 'audio',
            content: '',
            media: { mimeType: 'audio/ogg', url: 'https://x.enc', mediaKeyEncrypted: 'enc:abc' },
            audioTranscript: 'quero saber o preço do site',
          }),
        ];

        const request = builder.build(messages, PROMPT_VERSION);

        expect(request.messages[0].content).toBe(
          '[O cliente enviou um áudio dizendo: "quero saber o preço do site"]',
        );
      });

      it('áudio INBOUND sem transcrição ainda usa a descrição genérica (comportamento anterior preservado)', () => {
        const builder = new PromptBuilder();
        const messages = [
          buildMessage({
            direction: 'inbound',
            contentType: 'audio',
            content: '',
            media: { mimeType: 'audio/ogg', url: 'https://x.enc', mediaKeyEncrypted: 'enc:abc' },
          }),
        ];

        const request = builder.build(messages, PROMPT_VERSION);

        expect(request.messages[0].content).toBe('[O cliente enviou um(a) áudio, sem legenda]');
      });

      it('áudio OUTBOUND com audioTranscript preenchido (não deveria acontecer, mas não deve usar a transcrição — só faz sentido para inbound)', () => {
        const builder = new PromptBuilder();
        const messages = [
          buildMessage({
            direction: 'outbound',
            contentType: 'audio',
            content: '',
            media: { mimeType: 'audio/ogg', url: '', mediaKeyEncrypted: '' },
            audioTranscript: 'não deveria aparecer aqui',
          }),
        ];

        const request = builder.build(messages, PROMPT_VERSION);

        expect(request.messages[0].content).not.toContain('não deveria aparecer aqui');
        expect(request.messages[0].content).toBe('[Você enviou um(a) áudio, sem legenda]');
      });
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

  // --- closingDirective (2026-08-20, 3ª rodada) ---
  //
  // A causa raiz medida: o Cérebro da IA é texto livre do cliente e pode ser
  // MAIOR que o prompt base (10.395 vs 7.285 caracteres na instalação onde o
  // problema apareceu), e costuma conter instruções de conduta. Tudo que o
  // prompt base dizia sobre formato/postura ficava soterrado sob esse bloco.
  describe('closingDirective — a última palavra sobre formato e condução', () => {
    const WITH_CLOSING: PromptVersion = {
      ...PROMPT_VERSION,
      id: 'v-teste',
      closingDirective: 'LEMBRETE FINAL: responda em 2 ou 3 mensagens curtas.',
    };

    it('vem DEPOIS de TODOS os blocos de contexto — inclusive do Cérebro da IA', () => {
      const builder = new PromptBuilder();

      const request = builder.build(
        [],
        WITH_CLOSING,
        'Salão da Maria.',
        undefined,
        '# Aviso de Horário\nFora do expediente.',
        '# Origem desta conversa\nNós procuramos o lead primeiro.',
      );

      const prompt = request.systemPrompt;
      const closingIndex = prompt.indexOf('LEMBRETE FINAL');
      expect(closingIndex).toBeGreaterThan(prompt.indexOf('Salão da Maria.'));
      expect(closingIndex).toBeGreaterThan(prompt.indexOf('Fora do expediente.'));
      expect(closingIndex).toBeGreaterThan(prompt.indexOf('Nós procuramos o lead primeiro.'));
      // É literalmente o fim do prompt — é disso que vem o poder dela.
      expect(prompt.trimEnd().endsWith('responda em 2 ou 3 mensagens curtas.')).toBe(true);
    });

    it('continua sendo a última mesmo quando o Cérebro da IA é enorme (o caso real)', () => {
      const builder = new PromptBuilder();
      const cerebroGigante = `Regra de ouro: não empurro o serviço.\n${'x'.repeat(10_000)}`;

      const request = builder.build([], WITH_CLOSING, cerebroGigante);

      const prompt = request.systemPrompt;
      expect(prompt.indexOf('LEMBRETE FINAL')).toBeGreaterThan(
        prompt.indexOf('Regra de ouro: não empurro o serviço.'),
      );
    });

    it('versão sem closingDirective monta o prompt exatamente como antes (v1/v2/v3 intactos)', () => {
      const builder = new PromptBuilder();

      const semDiretiva = builder.build([], PROMPT_VERSION, 'Salão da Maria.');
      const comDiretivaVazia = builder.build(
        [],
        { ...PROMPT_VERSION, closingDirective: '   ' },
        'Salão da Maria.',
      );

      expect(comDiretivaVazia.systemPrompt).toBe(semDiretiva.systemPrompt);
      expect(semDiretiva.systemPrompt).not.toContain('LEMBRETE FINAL');
    });
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
