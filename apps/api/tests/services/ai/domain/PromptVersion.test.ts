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

describe('v5 (2026-08-24 — formato de balões escalonado por estágio, pedido direto do fundador)', () => {
  it('está registrada e é resolvível por id, sem substituir as anteriores', () => {
    expect(getPromptVersion('v5')).toBe(PROMPT_VERSIONS.v5);
    for (const id of ['v1', 'v2', 'v3', 'v4']) {
      expect(PROMPT_VERSIONS[id]).toBeDefined();
      expect(PROMPT_VERSIONS.v5.systemPrompt).not.toBe(PROMPT_VERSIONS[id].systemPrompt);
    }
  });

  it('substitui a regra fixa "sempre 2 ou 3 blocos" de v4 por uma regra escalonada por estágio', () => {
    const prompt = PROMPT_VERSIONS.v5.systemPrompt;
    // A regra rígida de v4 não pode reaparecer em v5.
    expect(PROMPT_VERSIONS.v4.systemPrompt).toMatch(/Toda resposta tem 2 ou 3 blocos/i);
    expect(prompt).not.toMatch(/Toda resposta tem 2 ou 3 blocos/i);
    expect(prompt).toMatch(/FORMATO DA RESPOSTA — ESCALONADO PELO ESTÁGIO DA CONVERSA/i);
  });

  it('estágio NEW: instrui UM bloco só, sem oferta ainda', () => {
    const prompt = PROMPT_VERSIONS.v5.systemPrompt;
    expect(prompt).toMatch(/estágio desta conversa é NEW.*responda em UM ÚNICO BLOCO/is);
    expect(prompt).toMatch(/NÃO ofereça o serviço nem fale de preço ainda neste\s+bloco único/i);
  });

  it('estágio CONTACTED/NEGOTIATING: instrui DOIS blocos — responde, depois pergunta', () => {
    const prompt = PROMPT_VERSIONS.v5.systemPrompt;
    expect(prompt).toMatch(/estágio é CONTACTED ou NEGOTIATING.*use DOIS blocos/is);
    expect(prompt).toMatch(/PRIMEIRO responde\s+diretamente ao que o cliente acabou de dizer/i);
    expect(prompt).toMatch(/SEGUNDO faz UMA pergunta concreta que mantém a conversa fluindo/i);
  });

  it('3º bloco é válvula de escape opcional, nunca obrigatório, nunca mais que 3', () => {
    const prompt = PROMPT_VERSIONS.v5.systemPrompt;
    expect(prompt).toMatch(/TERCEIRO bloco só quando for realmente necessário/i);
    expect(prompt).toMatch(/Não é\s+obrigatório usar os 3/i);
    expect(prompt).toMatch(/NUNCA use mais de 3/i);
  });

  it('mantém a inversão central de v4 (quem procurou foi você) e a oferta concreta, sem mudança', () => {
    const prompt = PROMPT_VERSIONS.v5.systemPrompt;
    expect(prompt).toMatch(/QUEM PROCUROU O CLIENTE FOI VOCÊ/i);
    expect(prompt).toMatch(/OFEREÇA DE FORMA CONCRETA/i);
    expect(prompt).toMatch(/NUNCA EXPLIQUE PARA O CLIENTE COMO O MERCADO DELE FUNCIONA/i);
  });

  it('define closingDirective própria, com a regra de formato escalonado repetida na posição de maior saliência', () => {
    const directive = PROMPT_VERSIONS.v5.closingDirective;
    expect(directive).toBeDefined();
    expect(directive).toMatch(/LEMBRETE FINAL/i);
    expect(directive).toMatch(/Formato ESCALONADO pelo estágio/i);
    expect(directive).toMatch(/NEW → 1 bloco só/i);
    expect(directive).toMatch(/CONTACTED\/NEGOTIATING → 2 blocos/i);
    // Curta de propósito — mesma disciplina de v4 (ver docstring de
    // `PromptVersion.closingDirective`), com folga maior por ter 1 exemplo
    // a mais (NEW + CONTACTED/NEGOTIATING, contra só 1 exemplo em v4).
    expect(directive!.length).toBeLessThan(1600);
    expect(directive).toMatch(/regras de nunca inventar informação.*continuam/is);
    expect(directive).not.toBe(PROMPT_VERSIONS.v4.closingDirective);
  });

  it('preserva mídia e marcadores TEXTUALMENTE — Pipeline/escalonamento intactos', () => {
    const mediaSentence = 'nunca finja saber o conteúdo desse arquivo nem invente o que ele mostra';
    expect(PROMPT_VERSIONS.v5.systemPrompt).toContain(mediaSentence);
    expect(PROMPT_VERSIONS.v5.systemPrompt).toContain(MARKER_INSTRUCTIONS);
  });

  it('mantém as regras absolutas de anti-alucinação e escalonamento', () => {
    const prompt = PROMPT_VERSIONS.v5.systemPrompt;
    expect(prompt).toMatch(/nunca invente preço, prazo, número, prova, portfólio/i);
    expect(prompt).toMatch(/nunca incentive.*burlar/i);
    expect(prompt).toMatch(/encaminhar a conversa para um de nossos atendentes/i);
  });
});

describe('v6 (2026-08-24 — reversão parcial de v4/v5: um tópico por mensagem, nunca despejar tudo de uma vez)', () => {
  it('está registrada e é resolvível por id, sem substituir as anteriores', () => {
    expect(getPromptVersion('v6')).toBe(PROMPT_VERSIONS.v6);
    for (const id of ['v1', 'v2', 'v3', 'v4', 'v5']) {
      expect(PROMPT_VERSIONS[id]).toBeDefined();
      expect(PROMPT_VERSIONS.v6.systemPrompt).not.toBe(PROMPT_VERSIONS[id].systemPrompt);
    }
  });

  it('remove a diretiva "OFEREÇA DE FORMA CONCRETA" de v4/v5, que empurrava a IA a despejar tudo de uma vez', () => {
    expect(PROMPT_VERSIONS.v5.systemPrompt).toMatch(/OFEREÇA DE FORMA CONCRETA/i);
    expect(PROMPT_VERSIONS.v6.systemPrompt).not.toMatch(/OFEREÇA DE FORMA CONCRETA/i);
  });

  it('instrui ritmo devagar, um tópico por mensagem, nunca serviço+preço+prazo juntos', () => {
    const prompt = PROMPT_VERSIONS.v6.systemPrompt;
    expect(prompt).toMatch(/CONDUZA A CONVERSA DEVAGAR, UM TÓPICO POR MENSAGEM/i);
    expect(prompt).toMatch(/NUNCA junte, na mesma\s+resposta, mais de UM assunto novo/i);
    expect(prompt).toMatch(
      /nunca fale do que a empresa faz, do preço e do prazo ao\s+mesmo tempo/i,
    );
    expect(prompt).toMatch(/deixar o cliente\s+confortável até ele mesmo querer avançar/i);
  });

  it('responde só o tópico perguntado, sem aproveitar para mencionar o resto da oferta', () => {
    const prompt = PROMPT_VERSIONS.v6.systemPrompt;
    expect(prompt).toMatch(/RESPONDA SÓ O QUE FOI PERGUNTADO, UM TÓPICO DE CADA VEZ/i);
    expect(prompt).toMatch(
      /não aproveite a pergunta\s+para também mencionar os outros detalhes da oferta/i,
    );
  });

  it('mantém uma pergunta por mensagem, agora combinada com um tópico por mensagem', () => {
    const prompt = PROMPT_VERSIONS.v6.systemPrompt;
    expect(prompt).toMatch(
      /No máximo UMA pergunta por mensagem, e no máximo UM tópico novo por mensagem/i,
    );
  });

  it('mantém a mecânica de blocos escalonada por estágio de v5, mas o bloco extra nunca introduz um segundo assunto', () => {
    const prompt = PROMPT_VERSIONS.v6.systemPrompt;
    expect(prompt).toMatch(/estágio desta conversa é NEW.*responda em UM ÚNICO BLOCO/is);
    expect(prompt).toMatch(/estágio é CONTACTED ou NEGOTIATING/i);
    expect(prompt).toMatch(/TERCEIRO bloco só quando o MESMO tópico\s+precisar de mais espaço/i);
    expect(prompt).toMatch(/NUNCA para além dela,\s+também falar de outro assunto/i);
  });

  it('preserva os guardas-corpo de v4/v5 que não são sobre ritmo: nunca ensinar o mercado do cliente', () => {
    const prompt = PROMPT_VERSIONS.v6.systemPrompt;
    expect(prompt).toMatch(/NUNCA EXPLIQUE PARA O CLIENTE COMO O MERCADO DELE FUNCIONA/i);
  });

  it('define closingDirective própria, reforçando "um tópico por mensagem" na posição de maior saliência', () => {
    const directive = PROMPT_VERSIONS.v6.closingDirective;
    expect(directive).toBeDefined();
    expect(directive).toMatch(/LEMBRETE FINAL/i);
    expect(directive).toMatch(/UM TÓPICO POR MENSAGEM, sempre/i);
    expect(directive).toMatch(
      /Nunca junte, na mesma resposta, o que a empresa faz \+ preço \+ prazo/i,
    );
    expect(directive).toMatch(/Vá com calma/i);
    expect(directive!.length).toBeLessThan(1700);
    expect(directive).toMatch(/regras de nunca inventar informação.*continuam/is);
    expect(directive).not.toBe(PROMPT_VERSIONS.v5.closingDirective);
  });

  it('o exemplo de NEGOTIATING responde só o preço, sem emendar prazo/escopo na mesma resposta', () => {
    const directive = PROMPT_VERSIONS.v6.closingDirective!;
    expect(directive).toMatch(/pergunta só o preço/i);
    expect(directive).toContain(
      'R$ 990, valor único, sem mensalidade.\nFaz sentido pra você nesse momento?',
    );
    expect(directive).not.toMatch(/pronto em cerca de \d+ dias/i);
  });

  it('preserva mídia e marcadores TEXTUALMENTE — Pipeline/escalonamento intactos', () => {
    const mediaSentence = 'nunca finja saber o conteúdo desse arquivo nem invente o que ele mostra';
    expect(PROMPT_VERSIONS.v6.systemPrompt).toContain(mediaSentence);
    expect(PROMPT_VERSIONS.v6.systemPrompt).toContain(MARKER_INSTRUCTIONS);
  });

  it('mantém as regras absolutas de anti-alucinação e escalonamento', () => {
    const prompt = PROMPT_VERSIONS.v6.systemPrompt;
    expect(prompt).toMatch(/nunca invente preço, prazo, número, prova, portfólio/i);
    expect(prompt).toMatch(/nunca incentive.*burlar/i);
    expect(prompt).toMatch(/encaminhar a conversa para um de nossos atendentes/i);
  });
});

/**
 * `v7` faz a IA distinguir QUEM começou a conversa. Duas gerações de defeito,
 * ambas verificadas no texto real das versões (ver docstring de `v7`):
 * `v4`/`v5` afirmavam "QUEM PROCUROU O CLIENTE FOI VOCÊ" incondicionalmente
 * (falso quando o cliente é quem chama); `v6` removeu a frase mas nunca deu
 * um critério objetivo para o modelo saber em qual caso estava. Cada teste
 * abaixo trava um lado da distinção — se alguém reescrever o prompt e voltar
 * a assumir um dos dois casos, o teste diz qual comportamento real regrediu.
 */
describe('v7 (2026-08-24 — distingue conversa iniciada pelo cliente de conversa iniciada por campanha)', () => {
  it('está registrada e é resolvível por id, sem substituir as anteriores', () => {
    expect(getPromptVersion('v7')).toBe(PROMPT_VERSIONS.v7);
    for (const id of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']) {
      expect(PROMPT_VERSIONS[id]).toBeDefined();
      expect(PROMPT_VERSIONS.v7.systemPrompt).not.toBe(PROMPT_VERSIONS[id].systemPrompt);
    }
  });

  it('não reintroduz o "QUEM PROCUROU O CLIENTE FOI VOCÊ" incondicional de v4/v5 — premissa falsa em conversa inbound', () => {
    for (const id of ['v4', 'v5']) {
      expect(PROMPT_VERSIONS[id].systemPrompt).toMatch(/QUEM PROCUROU O CLIENTE FOI VOCÊ/i);
    }
    // v6 já tinha removido a frase — o que faltava nele era o critério de
    // decisão, coberto pelo teste seguinte.
    expect(PROMPT_VERSIONS.v6.systemPrompt).not.toMatch(/QUEM PROCUROU O CLIENTE FOI VOCÊ/i);
    expect(PROMPT_VERSIONS.v7.systemPrompt).not.toMatch(/QUEM PROCUROU O CLIENTE FOI VOCÊ/i);
  });

  it('supre o que faltava em v6: um critério OBJETIVO para a IA saber em qual dos dois casos está', () => {
    // v6 mandava "entenda quem é a pessoa" sem nunca dizer como distinguir
    // uma conversa de campanha de uma conversa que o cliente iniciou.
    expect(PROMPT_VERSIONS.v6.systemPrompt).not.toMatch(/# Origem desta conversa/i);
    expect(PROMPT_VERSIONS.v7.systemPrompt).toMatch(/# Origem desta conversa/i);
  });

  it('explicita os DOIS casos de origem e amarra a distinção ao bloco "# Origem desta conversa"', () => {
    const prompt = PROMPT_VERSIONS.v7.systemPrompt;
    expect(prompt).toMatch(/IDENTIFIQUE COMO ESTA CONVERSA COMEÇOU/i);
    expect(prompt).toMatch(/CASO 1 — O CLIENTE PROCUROU VOCÊ/i);
    expect(prompt).toMatch(/CASO 2 — VOCÊ PROCUROU O CLIENTE/i);
    // É a ausência/presença do bloco de campanha que o modelo usa para decidir.
    expect(prompt).toMatch(/NÃO existe nenhum bloco "# Origem desta conversa"/i);
    expect(prompt).toMatch(/existe um bloco "# Origem desta conversa"/i);
  });

  it('CASO 1 (cliente chamou): descoberta primeiro — nome, ramo, segmento, intenção — antes de qualquer oferta', () => {
    const prompt = PROMPT_VERSIONS.v7.systemPrompt;
    expect(prompt).toMatch(/CONHEÇA A PESSOA ANTES DE OFERECER QUALQUER COISA/i);
    expect(prompt).toMatch(/pergunte o nome dela/i);
    expect(prompt).toMatch(/com o que ela trabalha/i);
    expect(prompt).toMatch(/segmento específico do negócio dela/i);
  });

  it('CASO 1: proíbe explicitamente ofertar/precificar na primeira resposta de uma conversa que o cliente iniciou', () => {
    expect(PROMPT_VERSIONS.v7.systemPrompt).toMatch(
      /NUNCA\s+apresente o serviço, o preço ou o prazo na primeira resposta de uma conversa que o cliente iniciou/i,
    );
  });

  it('traz exemplos concretos do tom de descoberta pedido pelo fundador', () => {
    const prompt = PROMPT_VERSIONS.v7.systemPrompt;
    expect(prompt).toMatch(/Qual é o seu nome\?/i);
    expect(prompt).toMatch(/com o que você trabalha\?/i);
    expect(prompt).toMatch(/Você já pensou na sua loja\s+aparecendo na internet\?/i);
  });

  it('não cola um nome real de tenant nos exemplos — o produto é multi-tenant', () => {
    // O nome vem do Cérebro da IA de cada empresa; um nome real aqui seria
    // copiado literalmente pela IA de outro tenant.
    expect(PROMPT_VERSIONS.v7.systemPrompt).not.toMatch(/Wesley Francis/i);
    expect(PROMPT_VERSIONS.v7.closingDirective).not.toMatch(/Wesley Francis/i);
    expect(PROMPT_VERSIONS.v7.systemPrompt).toMatch(/\[seu nome\]/);
  });

  it('mantém o ritmo de v6 (um tópico por mensagem) — v7 muda QUANDO a oferta entra, não a velocidade', () => {
    const prompt = PROMPT_VERSIONS.v7.systemPrompt;
    expect(prompt).toMatch(/CONDUZA A CONVERSA DEVAGAR, UM TÓPICO POR MENSAGEM/i);
    expect(prompt).toMatch(/RESPONDA SÓ O QUE FOI PERGUNTADO, UM TÓPICO DE CADA VEZ/i);
    expect(prompt).toMatch(/No máximo UMA pergunta por mensagem/i);
  });

  it('mantém o formato escalonado por estágio de v5/v6', () => {
    const prompt = PROMPT_VERSIONS.v7.systemPrompt;
    expect(prompt).toMatch(/estágio desta conversa é NEW.*responda em UM ÚNICO BLOCO/is);
    expect(prompt).toMatch(/estágio é CONTACTED ou NEGOTIATING/i);
  });

  it('preserva o guarda-corpo de v4 (nunca ensinar o mercado do cliente)', () => {
    expect(PROMPT_VERSIONS.v7.systemPrompt).toMatch(
      /NUNCA EXPLIQUE PARA O CLIENTE COMO O MERCADO DELE FUNCIONA/i,
    );
  });

  it('a closingDirective RAMIFICA nos dois casos — afirmar só um anularia o outro, por vir depois do bloco de campanha', () => {
    const directive = PROMPT_VERSIONS.v7.closingDirective;
    expect(directive).toBeDefined();
    expect(directive).toMatch(/COMO ESTA CONVERSA COMEÇOU decide sua postura/i);
    // Os dois ramos, explicitamente presentes.
    expect(directive).toMatch(/Se existe um bloco "# Origem desta conversa" acima/i);
    expect(directive).toMatch(/Se esse\s+bloco NÃO existe, foi o CLIENTE que procurou/i);
    expect(directive).toMatch(/nunca ofereça serviço nem preço antes disso/i);
    expect(directive!.length).toBeLessThan(1800);
    expect(directive).not.toBe(PROMPT_VERSIONS.v6.closingDirective);
  });

  it('preserva mídia e marcadores TEXTUALMENTE — Pipeline/escalonamento intactos', () => {
    const mediaSentence = 'nunca finja saber o conteúdo desse arquivo nem invente o que ele mostra';
    expect(PROMPT_VERSIONS.v7.systemPrompt).toContain(mediaSentence);
    expect(PROMPT_VERSIONS.v7.systemPrompt).toContain(MARKER_INSTRUCTIONS);
  });

  it('mantém as regras absolutas de anti-alucinação e escalonamento', () => {
    const prompt = PROMPT_VERSIONS.v7.systemPrompt;
    expect(prompt).toMatch(/nunca invente preço, prazo, número, prova, portfólio/i);
    expect(prompt).toMatch(/nunca incentive.*burlar/i);
    expect(prompt).toMatch(/encaminhar a conversa para um de nossos atendentes/i);
  });
});

/**
 * `v8` nasceu de uma investigação numa conversa REAL (não hipótese):
 * `ai_interactions.escalation_reason='UNKNOWN_ANSWER'` confirmou que a IA
 * escalou na primeira menção de uma funcionalidade fora da lista de
 * serviços, sem tentar explorar antes. Cada teste abaixo trava um pedaço do
 * comportamento corrigido — se alguém reescrever o prompt e voltar a deixar
 * a IA escalar sem explorar, o teste diz qual comportamento real regrediu.
 */
describe('v8 (2026-08-24 — explora antes de escalar, dona da conversa até o cliente convencido)', () => {
  it('está registrada e é resolvível por id, sem substituir as anteriores', () => {
    expect(getPromptVersion('v8')).toBe(PROMPT_VERSIONS.v8);
    for (const id of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']) {
      expect(PROMPT_VERSIONS[id]).toBeDefined();
      expect(PROMPT_VERSIONS.v8.systemPrompt).not.toBe(PROMPT_VERSIONS[id].systemPrompt);
    }
  });

  it('não tinha, em v7, nenhuma instrução de explorar antes de escalar — o gap real que causou o defeito', () => {
    expect(PROMPT_VERSIONS.v7.systemPrompt).not.toMatch(/EXPLORE o que você já sabe/i);
  });

  it('manda a IA conduzir a conversa inteira e explorar antes de encaminhar para um humano', () => {
    const prompt = PROMPT_VERSIONS.v8.systemPrompt;
    expect(prompt).toMatch(
      /VOCÊ CONDUZ A CONVERSA INTEIRA — da apresentação até o cliente estar convencido a contratar/i,
    );
    expect(prompt).toMatch(/EXPLORE o que você já sabe/i);
    expect(prompt).toMatch(/Mais\s+perguntas geram mais respostas/i);
  });

  it('proíbe encaminhar na hora quando o pedido não está exatamente na lista de serviços', () => {
    const prompt = PROMPT_VERSIONS.v8.systemPrompt;
    expect(prompt).toMatch(
      /QUANDO O CLIENTE PEDIR ALGO QUE NÃO ESTÁ EXATAMENTE NA LISTA DE SERVIÇOS, NÃO ENCAMINHE NA HORA/i,
    );
    expect(prompt).toMatch(/diga com sinceridade o que você TEM de relacionado/i);
    expect(prompt).toMatch(/pergunte se aquela parte específica é\s+realmente indispensável/i);
    expect(prompt).toMatch(/Só encaminhe para um humano DEPOIS que o cliente confirmar/i);
  });

  it('preserva os gatilhos de encaminhamento DIRETO (fechamento, pedido explícito, mídia) — não vira "nunca escalar"', () => {
    const prompt = PROMPT_VERSIONS.v8.systemPrompt;
    expect(prompt).toMatch(
      /Encaminhe direto para um humano \(sem precisar explorar mais\) só nestes casos/i,
    );
    expect(prompt).toMatch(/pede\s+explicitamente para falar com uma pessoa/i);
    expect(prompt).toMatch(
      /pergunta como\s+paga, como começa, pede orçamento ou proposta fechada/i,
    );
    expect(prompt).toMatch(/manda ou pede foto, áudio, vídeo ou\s+documento/i);
  });

  it('reforça o anti-alucinação: explorar nunca significa inventar o que a empresa não faz', () => {
    expect(PROMPT_VERSIONS.v8.systemPrompt).toMatch(
      /nunca invente preço, prazo, número, prova, portfólio, funcionalidade ou\s+caso de cliente/i,
    );
  });

  it('mantém a distinção de origem de v7 (cliente chamou vs. campanha), sem mudança', () => {
    const prompt = PROMPT_VERSIONS.v8.systemPrompt;
    expect(prompt).toMatch(/CASO 1 — O CLIENTE PROCUROU VOCÊ/i);
    expect(prompt).toMatch(/CASO 2 — VOCÊ PROCUROU O CLIENTE/i);
    expect(prompt).toMatch(/CONHEÇA A PESSOA ANTES DE OFERECER QUALQUER COISA/i);
  });

  it('mantém o ritmo e o formato de v6/v7 (um tópico por mensagem, blocos escalonados por estágio)', () => {
    const prompt = PROMPT_VERSIONS.v8.systemPrompt;
    expect(prompt).toMatch(/CONDUZA A CONVERSA DEVAGAR, UM TÓPICO POR MENSAGEM/i);
    expect(prompt).toMatch(/No máximo UMA pergunta por mensagem/i);
    expect(prompt).toMatch(/estágio desta conversa é NEW.*responda em UM ÚNICO BLOCO/is);
  });

  it('define closingDirective própria, reforçando "explorar antes de escalar" na posição de maior saliência', () => {
    const directive = PROMPT_VERSIONS.v8.closingDirective;
    expect(directive).toBeDefined();
    expect(directive).toMatch(/LEMBRETE FINAL/i);
    expect(directive).toMatch(
      /NÃO ENCAMINHE PARA UM HUMANO SÓ PORQUE O PEDIDO NÃO BATE 100% COM O QUE ESTÁ ESCRITO/i,
    );
    expect(directive).toMatch(/pergunte se é\s+indispensável antes de encaminhar/i);
    expect(directive!.length).toBeLessThan(2000);
    expect(directive).not.toBe(PROMPT_VERSIONS.v7.closingDirective);
  });

  it('o exemplo de pedido fora da lista explora antes de encaminhar, em vez de encaminhar na hora', () => {
    const directive = PROMPT_VERSIONS.v8.closingDirective!;
    expect(directive).toMatch(
      /Isso especificamente a gente ainda não faz, mas o restante do que você descreveu/i,
    );
    expect(directive).toMatch(/dá pra seguir sem ela por enquanto\?/i);
  });

  it('não cola um nome real de tenant nos exemplos — o produto é multi-tenant', () => {
    expect(PROMPT_VERSIONS.v8.systemPrompt).not.toMatch(/Wesley Francis/i);
    expect(PROMPT_VERSIONS.v8.closingDirective).not.toMatch(/Wesley Francis/i);
  });

  it('preserva mídia e marcadores TEXTUALMENTE — Pipeline/escalonamento intactos', () => {
    const mediaSentence = 'nunca finja saber o conteúdo desse arquivo nem invente o que ele mostra';
    expect(PROMPT_VERSIONS.v8.systemPrompt).toContain(mediaSentence);
    expect(PROMPT_VERSIONS.v8.systemPrompt).toContain(MARKER_INSTRUCTIONS);
  });

  it('mantém as regras absolutas de anti-alucinação e escalonamento', () => {
    const prompt = PROMPT_VERSIONS.v8.systemPrompt;
    expect(prompt).toMatch(/nunca prometa\s+aprovação nem resultado garantido/i);
    expect(prompt).toMatch(/nunca incentive.*burlar/i);
    expect(prompt).toMatch(/encaminhar a conversa para um de nossos atendentes/i);
  });
});

/**
 * `v9` nasceu de uma pergunta arquitetural do fundador (não um bug): como
 * garantir as mesmas regras de processo numa sessão nova, e no dia 1 de um
 * cliente futuro. Achado ao investigar: as regras já eram automáticas
 * (código, não Cérebro) — o único gap real era a sessão SEM NENHUM Cérebro
 * configurado, onde o exemplo "Me chamo [seu nome]" não tem nome nenhum
 * pra usar. Cada teste abaixo trava um pedaço da rede de segurança nova.
 */
describe('v9 (2026-08-24 — rede de segurança para sessão sem nenhum Cérebro configurado)', () => {
  it('está registrada e é resolvível por id, sem substituir as anteriores', () => {
    expect(getPromptVersion('v9')).toBe(PROMPT_VERSIONS.v9);
    for (const id of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8']) {
      expect(PROMPT_VERSIONS[id]).toBeDefined();
      expect(PROMPT_VERSIONS.v9.systemPrompt).not.toBe(PROMPT_VERSIONS[id].systemPrompt);
    }
  });

  it('v8 não tinha nenhuma instrução para a ausência do bloco de identidade — o gap real', () => {
    expect(PROMPT_VERSIONS.v8.systemPrompt).not.toMatch(
      /SUA IDENTIDADE E SEU CATÁLOGO VÊM EXCLUSIVAMENTE/i,
    );
  });

  it('define identidade/catálogo como vindos exclusivamente do bloco "# Informações da empresa"', () => {
    const prompt = PROMPT_VERSIONS.v9.systemPrompt;
    expect(prompt).toMatch(
      /SUA IDENTIDADE E SEU CATÁLOGO VÊM EXCLUSIVAMENTE DO BLOCO "# Informações da empresa"/i,
    );
  });

  it('proíbe inventar nome de atendente ou de empresa quando o bloco não existe', () => {
    const prompt = PROMPT_VERSIONS.v9.systemPrompt;
    expect(prompt).toMatch(
      /NUNCA invente um nome de atendente, nome de empresa, serviço ou preço\s+nessa situação/i,
    );
    expect(prompt).toMatch(/sem se apresentar com um nome\s+ou empresa que não existe/i);
  });

  it('mesmo sem empresa cadastrada, a fase de descoberta continua (cumprimentar e perguntar o nome da pessoa)', () => {
    const prompt = PROMPT_VERSIONS.v9.systemPrompt;
    expect(prompt).toMatch(
      /Continue cumprimentando normalmente e pode perguntar o nome da pessoa/i,
    );
    expect(prompt).toMatch(/ainda\s+estou me organizando por aqui, mas já te escuto/i);
  });

  it('guarda a instrução do CASO 1 de v7/v8: só se apresenta pelo nome SE houver um cadastrado', () => {
    const prompt = PROMPT_VERSIONS.v9.systemPrompt;
    expect(prompt).toMatch(
      /apresente-se pelo nome se houver um cadastrado nas\s+informações da empresa abaixo \(se não houver, cumprimente sem se apresentar por nome\)/i,
    );
  });

  it('acrescenta "nome de atendente, nome de empresa" à lista de anti-alucinação', () => {
    expect(PROMPT_VERSIONS.v9.systemPrompt).toMatch(
      /nunca invente nome de atendente, nome de empresa, preço, prazo, número/i,
    );
  });

  it('mantém tudo o que v8 já garantia: explorar antes de escalar, ritmo, distinção de origem, formato', () => {
    const prompt = PROMPT_VERSIONS.v9.systemPrompt;
    expect(prompt).toMatch(
      /VOCÊ CONDUZ A CONVERSA INTEIRA — da apresentação até o cliente estar convencido a contratar/i,
    );
    expect(prompt).toMatch(/CONDUZA A CONVERSA DEVAGAR, UM TÓPICO POR MENSAGEM/i);
    expect(prompt).toMatch(/CASO 1 — O CLIENTE PROCUROU VOCÊ/i);
    expect(prompt).toMatch(/CASO 2 — VOCÊ PROCUROU O CLIENTE/i);
    expect(prompt).toMatch(/estágio desta conversa é NEW.*responda em UM ÚNICO BLOCO/is);
  });

  it('define closingDirective própria, reforçando a regra de identidade na posição de maior saliência', () => {
    const directive = PROMPT_VERSIONS.v9.closingDirective;
    expect(directive).toBeDefined();
    expect(directive).toMatch(/LEMBRETE FINAL/i);
    expect(directive).toMatch(
      /SEM bloco "# Informações da empresa" nas informações desta conversa, você NÃO tem identidade nem/i,
    );
    expect(directive).toMatch(/nunca invente nome de atendente ou de\s+empresa/i);
    expect(directive!.length).toBeLessThan(2200);
    expect(directive).not.toBe(PROMPT_VERSIONS.v8.closingDirective);
  });

  it('a closingDirective traz os DOIS exemplos (com e sem empresa cadastrada), sem inventar nome no segundo', () => {
    const directive = PROMPT_VERSIONS.v9.closingDirective!;
    expect(directive).toMatch(
      /quando NÃO há nenhuma empresa cadastrada ainda \(sem inventar nome\)/i,
    );
    expect(directive).toContain(
      'Ainda estou me organizando por aqui, mas já te escuto. Como posso te chamar?',
    );
  });

  it('não cola um nome real de tenant nos exemplos — o produto é multi-tenant', () => {
    expect(PROMPT_VERSIONS.v9.systemPrompt).not.toMatch(/Wesley Francis/i);
    expect(PROMPT_VERSIONS.v9.closingDirective).not.toMatch(/Wesley Francis/i);
  });

  it('preserva mídia e marcadores TEXTUALMENTE — Pipeline/escalonamento intactos', () => {
    const mediaSentence = 'nunca finja saber o conteúdo desse arquivo nem invente o que ele mostra';
    expect(PROMPT_VERSIONS.v9.systemPrompt).toContain(mediaSentence);
    expect(PROMPT_VERSIONS.v9.systemPrompt).toContain(MARKER_INSTRUCTIONS);
  });

  it('mantém as regras absolutas de encaminhamento', () => {
    const prompt = PROMPT_VERSIONS.v9.systemPrompt;
    expect(prompt).toMatch(/nunca incentive.*burlar/i);
    expect(prompt).toMatch(/encaminhar a conversa para um de nossos atendentes/i);
  });
});
