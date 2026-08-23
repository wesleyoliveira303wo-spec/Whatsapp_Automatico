import { PromptVersionNotFoundError } from '../../../../src/services/ai/domain/errors/PromptVersionNotFoundError';
import {
  ESCALATION_MARKER_UNKNOWN_ANSWER,
  ESCALATION_MARKER_REQUESTED_HUMAN,
} from '../../../../src/services/ai/domain/escalationSignal';
import { STAGE_MARKER_PREFIX } from '../../../../src/services/ai/domain/stageSignal';
import {
  getPromptVersion,
  MARKER_INSTRUCTIONS,
  PROMPT_VERSIONS,
} from '../../../../src/services/ai/domain/PromptVersion';

describe('getPromptVersion', () => {
  it('devolve a PromptVersion registrada para um id existente', () => {
    expect(getPromptVersion('v1')).toBe(PROMPT_VERSIONS.v1);
  });

  it('lança PromptVersionNotFoundError para um id inexistente (achado F2 da auditoria do Bloco 3a)', () => {
    expect(() => getPromptVersion('versao-inexistente')).toThrow(PromptVersionNotFoundError);
    expect(() => getPromptVersion('versao-inexistente')).toThrow(
      'Versão de prompt desconhecida: "versao-inexistente"',
    );
  });
});

describe('v2 (Fase 1, Fase H — prompt consultivo, 2026-08-08)', () => {
  it('está registrada e é resolvível por id, sem substituir v1', () => {
    expect(getPromptVersion('v2')).toBe(PROMPT_VERSIONS.v2);
    expect(PROMPT_VERSIONS.v1).toBeDefined();
    expect(PROMPT_VERSIONS.v2.systemPrompt).not.toBe(PROMPT_VERSIONS.v1.systemPrompt);
  });

  it('instrui a IA a entender a necessidade ANTES de ofertar/precificar (postura consultiva)', () => {
    const prompt = PROMPT_VERSIONS.v2.systemPrompt;
    expect(prompt).toMatch(/ANTES de oferecer qualquer serviço/i);
    expect(prompt).toMatch(/não presuma que todo contato é cliente/i);
    expect(prompt).toMatch(/nunca pergunte de novo algo que ela já respondeu/i);
  });

  it('proíbe explicitamente prometer aprovação e incentivar fraude/burla (pedido novo do fundador, ausente em v1)', () => {
    const prompt = PROMPT_VERSIONS.v2.systemPrompt;
    expect(prompt).toMatch(/nunca prometa aprovação/i);
    expect(prompt).toMatch(/nunca incentive.*burlar/i);
    expect(PROMPT_VERSIONS.v1.systemPrompt).not.toMatch(/nunca prometa aprovação/i);
  });

  it('mantém a regra de nunca inventar preço/prazo e de escalar quando não souber (herdada de v1)', () => {
    const prompt = PROMPT_VERSIONS.v2.systemPrompt;
    expect(prompt).toMatch(/nunca invente preço, prazo/i);
    expect(prompt).toMatch(/encaminhar a conversa para um.*atendente humano/i);
  });

  it('instrui brevidade (mensagens curtas, estilo WhatsApp)', () => {
    expect(PROMPT_VERSIONS.v2.systemPrompt).toMatch(/mensagens curtas/i);
  });

  it('preserva a instrução de mídia IDÊNTICA a v1', () => {
    const mediaSentence = 'nunca finja saber o conteúdo desse arquivo nem invente o que ele mostra';
    expect(PROMPT_VERSIONS.v1.systemPrompt).toContain(mediaSentence);
    expect(PROMPT_VERSIONS.v2.systemPrompt).toContain(mediaSentence);
  });

  it('preserva os DOIS marcadores técnicos (estágio + escalonamento) com o MESMO formato de v1 — crítico para Pipeline/escalonamento continuarem funcionando', () => {
    for (const prompt of [PROMPT_VERSIONS.v1.systemPrompt, PROMPT_VERSIONS.v2.systemPrompt]) {
      expect(prompt).toContain(`${STAGE_MARKER_PREFIX}NEW`);
      expect(prompt).toContain(`${STAGE_MARKER_PREFIX}NEGOTIATING`);
      expect(prompt).toContain(ESCALATION_MARKER_UNKNOWN_ANSWER);
      expect(prompt).toContain(ESCALATION_MARKER_REQUESTED_HUMAN);
    }
  });

  it('o bloco de marcadores é TEXTUALMENTE idêntico entre v1 e v2 (mesma constante compartilhada, sem drift)', () => {
    const markerStart = 'INSTRUÇÃO OBRIGATÓRIA sobre marcadores internos';
    const v1MarkerBlock = PROMPT_VERSIONS.v1.systemPrompt.slice(
      PROMPT_VERSIONS.v1.systemPrompt.indexOf(markerStart),
    );
    const v2MarkerBlock = PROMPT_VERSIONS.v2.systemPrompt.slice(
      PROMPT_VERSIONS.v2.systemPrompt.indexOf(markerStart),
    );
    expect(v1MarkerBlock).toBe(v2MarkerBlock);
  });
});

/**
 * `v3` nasceu da leitura de UMA conversa real que morreu em 6 turnos (o
 * primeiro disparo para número frio, Fase L/L5). Cada teste abaixo trava um
 * dos quatro defeitos diagnosticados naquela conversa — se alguém reescrever
 * o prompt no futuro e remover uma dessas instruções, o teste quebra e diz
 * qual comportamento real voltou a ficar desprotegido.
 */
describe('v3 (2026-08-20 — desperta interesse + resposta em blocos)', () => {
  it('está registrada e é resolvível por id, sem substituir v1 nem v2', () => {
    expect(getPromptVersion('v3')).toBe(PROMPT_VERSIONS.v3);
    expect(PROMPT_VERSIONS.v1).toBeDefined();
    expect(PROMPT_VERSIONS.v2).toBeDefined();
    expect(PROMPT_VERSIONS.v3.systemPrompt).not.toBe(PROMPT_VERSIONS.v2.systemPrompt);
  });

  // Defeito (a): "o que deseja?" → "Boa tarde! Tudo bem?" (turno inteiro sem conteúdo).
  it('proíbe gastar um turno inteiro com cumprimento vazio (defeito real: "Boa tarde! Tudo bem?")', () => {
    const prompt = PROMPT_VERSIONS.v3.systemPrompt;
    expect(prompt).toMatch(/toda mensagem sua precisa fazer a conversa AVANÇAR/i);
    expect(prompt).toMatch(/nunca gaste um turno inteiro com/i);
    expect(prompt).toMatch(/responda na MESMA mensagem em que cumprimenta/i);
  });

  // Defeito (b): "Ele é desenvolvedor e cria sites profissionais" — fala de nós, não dele.
  it('manda falar do negócio do CLIENTE e abrir pela consequência, nunca se apresentando primeiro', () => {
    const prompt = PROMPT_VERSIONS.v3.systemPrompt;
    expect(prompt).toMatch(/FALANDO DO NEGÓCIO DELE, NUNCA DE SI MESMO/i);
    expect(prompt).toMatch(/CONSEQUÊNCIA CONCRETA/i);
  });

  // Guarda-corpo do estilo provocativo escolhido pelo fundador: provocar sem
  // inventar um fato sobre o negócio do cliente.
  it('proíbe transformar a provocação em afirmação inventada sobre o negócio do cliente', () => {
    const prompt = PROMPT_VERSIONS.v3.systemPrompt;
    expect(prompt).toMatch(/situação GERAL e provável do mercado/i);
    expect(prompt).toMatch(/nunca afirme que o negócio dele vai\s+mal/i);
    expect(prompt).toMatch(/provoque a reflexão, nunca acuse/i);
  });

  // Defeito (c): cada mensagem fazia uma só coisa, sempre num bloco único.
  it('instrui o formato em blocos separados por quebra de linha (casa com splitReplyIntoParagraphs)', () => {
    const prompt = PROMPT_VERSIONS.v3.systemPrompt;
    expect(prompt).toMatch(/FORMATO OBRIGATÓRIO DAS SUAS RESPOSTAS/i);
    expect(prompt).toMatch(/cada um em SUA PRÓPRIA LINHA/i);
    expect(prompt).toMatch(/nunca faça mais de uma pergunta na mesma resposta/i);
    // v1 (default histórico) nunca instruiu quebra de linha — é por isso que
    // a divisão em balões ficou inerte desde que foi construída.
    expect(PROMPT_VERSIONS.v1.systemPrompt).not.toMatch(/quebra de linha/i);
  });

  // CORREÇÃO 2026-08-20 (2ª rodada) — a 1ª versão do v3 dizia "use no MÁXIMO
  // 3 blocos" e "quando fizer sentido, termine com UMA pergunta": os dois
  // qualificadores davam licença para o modelo continuar respondendo em um
  // balão só e terminando em ponto final, que foi exatamente o que ele fez.
  it('não deixa o formato nem a pergunta como opcionais (os qualificadores que o modelo explorou na 1ª versão)', () => {
    const prompt = PROMPT_VERSIONS.v3.systemPrompt;
    expect(prompt).toMatch(/TODA resposta sua termina com uma pergunta/i);
    expect(prompt).not.toMatch(/quando fizer sentido, termine com/i);
    expect(prompt).not.toMatch(/nem toda resposta precisa dos três blocos/i);
  });

  // O caso real: cliente respondeu "Obrigado" e depois "Eu sei disso", e a IA
  // tratou como fim de papo, repetindo o mesmo argumento sem nenhuma pergunta.
  it('trata resposta curta e sem entusiasmo como sinal de conduzir, nunca como fim de conversa', () => {
    const prompt = PROMPT_VERSIONS.v3.systemPrompt;
    expect(prompt).toMatch(
      /não é fim de conversa, é sinal de que ele está esperando você conduzir/i,
    );
    expect(prompt).toMatch(/nunca\s+repita o argumento que você já deu/i);
  });

  // A causa raiz medida da 2ª rodada: os 4 exemplos de MARKER_INSTRUCTIONS
  // (45% do prompt, e o fim dele) mostram todos uma resposta de linha única.
  // Sem exemplos DEPOIS deles, a instrução de formato perde para o exemplo.
  it('põe exemplos de resposta multi-linha DEPOIS do bloco de marcadores (posição de maior saliência)', () => {
    const prompt = PROMPT_VERSIONS.v3.systemPrompt;
    const markerIndex = prompt.indexOf('INSTRUÇÃO OBRIGATÓRIA sobre marcadores internos');
    const examplesIndex = prompt.indexOf('EXEMPLOS DO FORMATO CERTO');

    expect(examplesIndex).toBeGreaterThan(markerIndex);
    // Quebras de linha REAIS (não a sequência literal "\n" usada nos exemplos
    // de marcador) — é a estrutura visual que precisa ser demonstrada.
    expect(prompt.slice(examplesIndex)).toContain('\n');
    // v1/v2 continuam terminando nos marcadores, sem estes exemplos.
    expect(PROMPT_VERSIONS.v1.systemPrompt).not.toContain('EXEMPLOS DO FORMATO CERTO');
    expect(PROMPT_VERSIONS.v2.systemPrompt).not.toContain('EXEMPLOS DO FORMATO CERTO');
  });

  // Defeito (d), o mais grave: a conversa morreu num elogio genérico logo
  // depois do sinal de compra ("gostaria de alavancar para vender...").
  it('proíbe responder um sinal de interesse só com elogio, sem próximo passo', () => {
    const prompt = PROMPT_VERSIONS.v3.systemPrompt;
    expect(prompt).toMatch(/NUNCA responda apenas elogiando ou concordando/i);
    expect(prompt).toMatch(/sem pergunta e sem próximo passo mata a conversa/i);
  });

  it('mantém as regras absolutas de v2 e acrescenta prova/número/caso de cliente ao anti-alucinação', () => {
    const prompt = PROMPT_VERSIONS.v3.systemPrompt;
    expect(prompt).toMatch(/nunca prometa aprovação/i);
    expect(prompt).toMatch(/nunca incentive.*burlar/i);
    expect(prompt).toMatch(/prova ou caso de cliente/i);
    expect(prompt).toMatch(/encaminhar a conversa para um atendente humano/i);
  });

  it('preserva a instrução de mídia IDÊNTICA a v1/v2', () => {
    const mediaSentence = 'nunca finja saber o conteúdo desse arquivo nem invente o que ele mostra';
    expect(PROMPT_VERSIONS.v3.systemPrompt).toContain(mediaSentence);
  });

  // Comparação pela constante EXPORTADA, não por slice-até-o-fim como em
  // v1/v2: desde a 2ª rodada de 2026-08-20 o v3 não termina mais nos
  // marcadores (V3_FORMAT_EXAMPLES vem depois). O que precisa ser garantido
  // é que o bloco de marcadores está presente e íntegro, byte a byte.
  it('embute o bloco de marcadores TEXTUALMENTE íntegro — Pipeline/escalonamento intactos', () => {
    expect(PROMPT_VERSIONS.v3.systemPrompt).toContain(MARKER_INSTRUCTIONS);
    expect(PROMPT_VERSIONS.v1.systemPrompt).toContain(MARKER_INSTRUCTIONS);
  });
});

/**
 * `v4` inverte a premissa central de `v2`/`v3`. Aqueles mandavam "entender
 * antes de ofertar" — postura de quem RECEBE um contato. Em prospecção ativa
 * (campanha) quem procurou foi a empresa, e essa mesma instrução produziu, em
 * teste real, uma conversa de 12 turnos sem UMA oferta: a IA interrogava e
 * explicava o mercado do cliente para ele, até ele reagir duas vezes com
 * "tá me ensinando a trabalhar?" e "seja mais direto!".
 */
describe('v4 (2026-08-20 — apresenta e oferece; prospecção ativa)', () => {
  it('está registrada e é resolvível por id, sem substituir as anteriores', () => {
    expect(getPromptVersion('v4')).toBe(PROMPT_VERSIONS.v4);
    for (const id of ['v1', 'v2', 'v3']) {
      expect(PROMPT_VERSIONS[id]).toBeDefined();
      expect(PROMPT_VERSIONS.v4.systemPrompt).not.toBe(PROMPT_VERSIONS[id].systemPrompt);
    }
  });

  it('inverte a premissa: quem procurou foi a empresa, então a IA apresenta e oferece', () => {
    const prompt = PROMPT_VERSIONS.v4.systemPrompt;
    expect(prompt).toMatch(/QUEM PROCUROU O CLIENTE FOI VOCÊ/i);
    expect(prompt).toMatch(/é SUA obrigação apresentar o serviço e conduzir até a\s+contratação/i);
    // A instrução de v2/v3 que causou o interrogatório não pode reaparecer.
    expect(prompt).not.toMatch(/ANTES de oferecer qualquer serviço/i);
    expect(prompt).not.toMatch(/Entenda antes de ofertar/i);
  });

  // O defeito mais citado pelo cliente real, duas vezes na mesma conversa.
  it('proíbe explicar ao cliente como o mercado dele funciona ("tá me ensinando a trabalhar?")', () => {
    const prompt = PROMPT_VERSIONS.v4.systemPrompt;
    expect(prompt).toMatch(/NUNCA EXPLIQUE PARA O CLIENTE COMO O MERCADO DELE FUNCIONA/i);
    expect(prompt).toMatch(/Ele trabalha nisso todo dia e sabe muito mais/i);
    // O v3 mandava exatamente o contrário (abrir pela dor/consequência).
    expect(PROMPT_VERSIONS.v3.systemPrompt).toMatch(/CONSEQUÊNCIA CONCRETA/i);
    expect(prompt).not.toMatch(/CONSEQUÊNCIA CONCRETA/i);
  });

  it('exige oferta concreta (preço/prazo/escopo) em vez de descrição vaga', () => {
    const prompt = PROMPT_VERSIONS.v4.systemPrompt;
    expect(prompt).toMatch(/OFEREÇA DE FORMA CONCRETA/i);
    expect(prompt).toMatch(/o que está incluso, o preço, o prazo/i);
    expect(prompt).toMatch(/perguntas.*servem para ADAPTAR a oferta, nunca para adiar a oferta/is);
  });

  it('define closingDirective — o bloco que o PromptBuilder põe DEPOIS do Cérebro da IA', () => {
    const directive = PROMPT_VERSIONS.v4.closingDirective;
    expect(directive).toBeDefined();
    expect(directive).toMatch(/LEMBRETE FINAL/i);
    expect(directive).toContain('\n');
    // Curta de propósito: se crescer demais deixa de ser uma diretiva final e
    // vira mais um bloco competindo por atenção.
    expect(directive!.length).toBeLessThan(1200);
    // Escopada a estilo/condução: nunca pode enfraquecer o anti-alucinação.
    expect(directive).toMatch(/regras de nunca inventar informação.*continuam/is);
    // Só v4 tem — v1/v2/v3 seguem montados exatamente como antes.
    for (const id of ['v1', 'v2', 'v3']) {
      expect(PROMPT_VERSIONS[id].closingDirective).toBeUndefined();
    }
  });

  it('preserva mídia e marcadores TEXTUALMENTE — Pipeline/escalonamento intactos', () => {
    const mediaSentence = 'nunca finja saber o conteúdo desse arquivo nem invente o que ele mostra';
    expect(PROMPT_VERSIONS.v4.systemPrompt).toContain(mediaSentence);
    expect(PROMPT_VERSIONS.v4.systemPrompt).toContain(MARKER_INSTRUCTIONS);
  });

  it('mantém as regras absolutas de anti-alucinação e escalonamento', () => {
    const prompt = PROMPT_VERSIONS.v4.systemPrompt;
    expect(prompt).toMatch(/nunca invente preço, prazo, número, prova, portfólio/i);
    expect(prompt).toMatch(/nunca incentive.*burlar/i);
    expect(prompt).toMatch(/encaminhar a conversa para um atendente humano/i);
  });
});
