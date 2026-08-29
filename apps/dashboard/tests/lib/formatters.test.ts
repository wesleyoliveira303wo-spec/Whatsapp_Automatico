import {
  formatCostUsd,
  formatCostUsdExact,
  formatCount,
  formatStatusLabel,
  statusBadgeClassName,
  formatDisconnectReasonLabel,
  formatDateTime,
  formatShortDate,
  formatConversationTimestamp,
  formatContactDisplayName,
  formatContactDisplayNameParts,
  formatContactInitials,
  formatPersonLabel,
  formatPersonLabelParts,
  PRIVATE_CONTACT_LABEL,
  formatConversationStageLabel,
  CONVERSATION_STAGE_ORDER,
  formatElapsedDays,
  PIPELINE_COLUMN_ORDER,
  NOT_CLIENT_COLUMN,
  formatPipelineColumnLabel,
  pipelineColumnDotClassName,
  formatPhoneNumber,
  formatClientSince,
  formatDayDivider,
  isSameCalendarDay,
  isSummaryOutdated,
  formatMessageTime,
} from '../../lib/formatters';

describe('formatters (M2, Fase 4)', () => {
  describe('formatStatusLabel', () => {
    it('traduz cada status para pt-BR', () => {
      expect(formatStatusLabel('connected')).toBe('Conectado');
      expect(formatStatusLabel('connecting')).toBe('Conectando…');
      expect(formatStatusLabel('disconnected')).toBe('Desconectado');
    });
  });

  describe('statusBadgeClassName', () => {
    it('devolve uma classe diferente para cada status', () => {
      const classes = new Set([
        statusBadgeClassName('connected'),
        statusBadgeClassName('connecting'),
        statusBadgeClassName('disconnected'),
      ]);
      expect(classes.size).toBe(3);
    });
  });

  describe('formatDisconnectReasonLabel', () => {
    it('devolve undefined quando o motivo não está presente', () => {
      expect(formatDisconnectReasonLabel(undefined)).toBeUndefined();
    });

    it('traduz um motivo conhecido', () => {
      expect(formatDisconnectReasonLabel('logged_out')).toBe('Desconectado pelo celular (logout)');
    });
  });

  describe('formatDateTime', () => {
    it("devolve '—' para undefined", () => {
      expect(formatDateTime(undefined)).toBe('—');
    });

    it("devolve '—' para uma string inválida", () => {
      expect(formatDateTime('não-é-uma-data')).toBe('—');
    });

    it('formata uma data ISO válida', () => {
      const formatted = formatDateTime('2026-07-09T12:30:00.000Z');
      expect(formatted).toMatch(/2026/);
    });
  });

  // Auditoria do Perfil (2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fase 2) —
  // "Membro desde" quer só o dia; `formatDateTime` (com segundos) é ruído.
  describe('formatShortDate', () => {
    it("devolve '—' para undefined", () => {
      expect(formatShortDate(undefined)).toBe('—');
    });

    it("devolve '—' para uma string inválida", () => {
      expect(formatShortDate('não-é-uma-data')).toBe('—');
    });

    it('formata uma data ISO válida sem hora', () => {
      // Meio-dia UTC — evita virar o dia em fusos com offset negativo (mesma
      // cautela de `formatDateTime` acima: casar com o dia exige um horário
      // longe da meia-noite, não a hora exata do host que roda o teste).
      const formatted = formatShortDate('2026-01-15T12:00:00.000Z');
      expect(formatted).toMatch(/15\/01\/2026/);
      expect(formatted).not.toMatch(/:/); // sem hora, diferente de formatDateTime
    });
  });

  describe('formatConversationTimestamp (Milestone 6, Bloco M6H-2)', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-24T15:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("devolve '—' para undefined", () => {
      expect(formatConversationTimestamp(undefined)).toBe('—');
    });

    it('mostra só a hora quando é hoje', () => {
      expect(formatConversationTimestamp('2026-07-24T12:30:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
    });

    it('mostra dia/mês quando não é hoje', () => {
      expect(formatConversationTimestamp('2026-07-20T12:30:00.000Z')).toBe('20/07');
    });
  });

  describe('formatContactDisplayName (regra 2026-08-20: nome salvo > telefone + apelido)', () => {
    it('usa savedContactName sozinho quando presente, mesmo com contactName e telefone disponíveis', () => {
      expect(
        formatContactDisplayName('5511999999999@s.whatsapp.net', 'Apelido WhatsApp', 'Maria Salva'),
      ).toBe('Maria Salva');
    });

    // Mudança de política 2026-08-20 (pedido do fundador): antes, o apelido do
    // WhatsApp sozinho já bastava como "nome". Agora, sem um nome SALVO, o
    // telefone é obrigatório — o apelido só complementa.
    it('sem nome salvo, combina telefone + apelido do WhatsApp (nunca só o apelido)', () => {
      expect(formatContactDisplayName('5511999999999@s.whatsapp.net', 'Maria Silva')).toBe(
        '+55 (11) 99999-9999 · Maria Silva',
      );
    });

    // O bug original: sem nome, a lista exibia os dígitos crus ("5511999999999"),
    // e não o telefone formatado — em 67% da base real.
    it('sem nome salvo nem apelido, mostra só o telefone FORMATADO, nunca os dígitos crus', () => {
      expect(formatContactDisplayName('5511999999999@s.whatsapp.net')).toBe('+55 (11) 99999-9999');
    });

    it('ignora savedContactName/contactName quando são só espaços', () => {
      expect(formatContactDisplayName('5511999999999@s.whatsapp.net', '   ', '   ')).toBe(
        '+55 (11) 99999-9999',
      );
    });

    it('formata também o celular sem o 9º dígito (12 dígitos), sem inventar um dígito', () => {
      expect(formatContactDisplayName('556588887777@s.whatsapp.net')).toBe('+55 (65) 8888-7777');
    });

    it('usa um rótulo curto para LID sem apelido, nunca o número gigante de privacidade', () => {
      expect(formatContactDisplayName('225236742053984@lid')).toBe(PRIVATE_CONTACT_LABEL);
    });

    it('LID sem nome salvo usa o apelido do WhatsApp sozinho — não existe telefone a exibir', () => {
      expect(formatContactDisplayName('225236742053984@lid', 'Wesley')).toBe('Wesley');
    });

    it('LID com nome salvo usa só o nome salvo', () => {
      expect(formatContactDisplayName('225236742053984@lid', 'Wesley', 'Wesley Francis')).toBe(
        'Wesley Francis',
      );
    });

    it('ignora um "nome"/apelido sem letra nem dígito (só emoji/pontuação) e usa o telefone', () => {
      expect(formatContactDisplayName('5511999999999@s.whatsapp.net', '❤️')).toBe(
        '+55 (11) 99999-9999',
      );
      expect(formatContactDisplayName('5511999999999@s.whatsapp.net', '.')).toBe(
        '+55 (11) 99999-9999',
      );
    });

    it('aceita nome salvo em qualquer alfabeto (não só A-Z)', () => {
      expect(formatContactDisplayName('5511999999999@s.whatsapp.net', undefined, 'Ана')).toBe(
        'Ана',
      );
    });

    it('colapsa espaços internos para toda linha da lista ter a mesma cara', () => {
      expect(
        formatContactDisplayName('5511999999999@s.whatsapp.net', undefined, 'Maria   da    Silva'),
      ).toBe('Maria da Silva');
    });

    it('trunca um nome salvo gigante em vez de deixar a linha quebrar', () => {
      const gigante = 'A'.repeat(80);
      const resultado = formatContactDisplayName(
        '5511999999999@s.whatsapp.net',
        undefined,
        gigante,
      );

      expect(resultado.length).toBeLessThanOrEqual(40);
      expect(resultado.endsWith('…')).toBe(true);
    });

    // CORREÇÃO 2026-08-21 (pedido do fundador: apelido em fonte menor/mais
    // clara, ver `formatContactDisplayNameParts`/`DisplayNameParts`): cada
    // parte agora é truncada de forma INDEPENDENTE, não mais a string
    // combinada como um todo — o telefone nunca é cortado por causa de um
    // apelido grande.
    it('trunca o apelido independentemente, sem nunca cortar o telefone', () => {
      const apelidoGigante = 'A'.repeat(80);
      const resultado = formatContactDisplayName('5511999999999@s.whatsapp.net', apelidoGigante);

      expect(resultado.startsWith('+55 (11) 99999-9999 · ')).toBe(true);
      expect(resultado.endsWith('…')).toBe(true);
      // Prefixo do telefone (22 caracteres, com os parênteses do DDD) +
      // apelido truncado (até 40).
      expect(resultado.length).toBeLessThanOrEqual(62);
    });
  });

  describe('formatContactDisplayNameParts (2026-08-21 — apelido em partes, para estilização visual)', () => {
    it('savedContactName vira só primary, sem secondary', () => {
      expect(
        formatContactDisplayNameParts('5511999999999@s.whatsapp.net', 'Apelido', 'Maria Salva'),
      ).toEqual({ primary: 'Maria Salva' });
    });

    it('sem nome salvo, telefone vira primary e o apelido vira secondary', () => {
      expect(formatContactDisplayNameParts('5511999999999@s.whatsapp.net', 'Maria Silva')).toEqual({
        primary: '+55 (11) 99999-9999',
        secondary: 'Maria Silva',
      });
    });

    it('sem nome salvo nem apelido, só primary (telefone), sem secondary', () => {
      expect(formatContactDisplayNameParts('5511999999999@s.whatsapp.net')).toEqual({
        primary: '+55 (11) 99999-9999',
      });
    });

    it('LID sem apelido: só primary (PRIVATE_CONTACT_LABEL), sem secondary', () => {
      expect(formatContactDisplayNameParts('225236742053984@lid')).toEqual({
        primary: PRIVATE_CONTACT_LABEL,
      });
    });

    it('LID com apelido: apelido vira primary sozinho — não existe telefone para secondary', () => {
      expect(formatContactDisplayNameParts('225236742053984@lid', 'Wesley')).toEqual({
        primary: 'Wesley',
      });
    });
  });

  describe('formatContactInitials (Milestone 6, Bloco M6H-2b; prioridade de nome salvo 2026-08-20)', () => {
    it('usa as iniciais das duas primeiras palavras do contactName', () => {
      expect(formatContactInitials('5511999999999@s.whatsapp.net', 'Maria Silva')).toBe('MS');
    });

    it('usa 1 letra quando contactName tem uma única palavra', () => {
      expect(formatContactInitials('5511999999999@s.whatsapp.net', 'Loja')).toBe('L');
    });

    it('prefere savedContactName sobre contactName (mesma prioridade de formatContactDisplayName)', () => {
      expect(
        formatContactInitials('5511999999999@s.whatsapp.net', 'Apelido WhatsApp', 'Zeca Salvo'),
      ).toBe('ZS');
    });

    it('cai para os últimos 2 dígitos do número quando não há contactName nem savedContactName', () => {
      expect(formatContactInitials('5511999999999@s.whatsapp.net')).toBe('99');
    });

    // Bug do avatar "bugado": um emoji ocupa dois índices em JavaScript, então
    // `nome[0]` devolvia meio caractere e o círculo exibia um glifo inválido.
    it('não corta emoji ao meio quando o nome começa com um', () => {
      const iniciais = formatContactInitials('5511999999999@s.whatsapp.net', '🌟 Estrela');

      expect(iniciais).toBe('🌟E');
    });

    it('cai para o número quando o nome não tem letra nem dígito', () => {
      expect(formatContactInitials('5511999999999@s.whatsapp.net', '❤️')).toBe('99');
    });
  });

  describe('formatPersonLabel (aba Contatos/Campanhas — mesma regra sobre telefone E.164 puro)', () => {
    it('usa savedName sozinho quando presente', () => {
      expect(
        formatPersonLabel({
          phoneE164: '5511999999999',
          savedName: 'Maria Salva',
          nickname: 'Apelido',
        }),
      ).toBe('Maria Salva');
    });

    it('sem savedName, combina telefone + nickname', () => {
      expect(formatPersonLabel({ phoneE164: '5511999999999', nickname: 'Maria Silva' })).toBe(
        '+55 (11) 99999-9999 · Maria Silva',
      );
    });

    it('sem savedName nem nickname, mostra só o telefone formatado', () => {
      expect(formatPersonLabel({ phoneE164: '5511999999999' })).toBe('+55 (11) 99999-9999');
    });

    it('ignora nickname sem letra nem dígito', () => {
      expect(formatPersonLabel({ phoneE164: '5511999999999', nickname: '❤️' })).toBe(
        '+55 (11) 99999-9999',
      );
    });
  });

  describe('formatPersonLabelParts (2026-08-21 — apelido em partes, para estilização visual)', () => {
    it('savedName vira só primary, sem secondary', () => {
      expect(
        formatPersonLabelParts({
          phoneE164: '5511999999999',
          savedName: 'Maria Salva',
          nickname: 'Apelido',
        }),
      ).toEqual({ primary: 'Maria Salva' });
    });

    it('sem savedName, telefone vira primary e o nickname vira secondary', () => {
      expect(
        formatPersonLabelParts({ phoneE164: '5511999999999', nickname: 'Maria Silva' }),
      ).toEqual({
        primary: '+55 (11) 99999-9999',
        secondary: 'Maria Silva',
      });
    });

    it('sem savedName nem nickname, só primary (telefone), sem secondary', () => {
      expect(formatPersonLabelParts({ phoneE164: '5511999999999' })).toEqual({
        primary: '+55 (11) 99999-9999',
      });
    });
  });

  describe('formatConversationStageLabel / CONVERSATION_STAGE_ORDER (pipeline de CRM, Milestone 6, Bloco M6H-5)', () => {
    it('traduz cada estágio para pt-BR', () => {
      expect(formatConversationStageLabel('new')).toBe('Novo');
      expect(formatConversationStageLabel('contacted')).toBe('Contatado');
      expect(formatConversationStageLabel('negotiating')).toBe('Negociando');
      expect(formatConversationStageLabel('closed_won')).toBe('Fechado');
      expect(formatConversationStageLabel('closed_lost')).toBe('Perdido');
    });

    it('CONVERSATION_STAGE_ORDER lista os 5 estágios, na ordem do funil', () => {
      expect(CONVERSATION_STAGE_ORDER).toEqual([
        'new',
        'contacted',
        'negotiating',
        'closed_won',
        'closed_lost',
      ]);
    });
  });

  describe('PIPELINE_COLUMN_ORDER / formatPipelineColumnLabel (coluna "Não cliente", ADR #96)', () => {
    it('as colunas do board são "Não cliente" primeiro, depois os 5 estágios do funil (reskin 2026-08-07, Design System)', () => {
      expect(PIPELINE_COLUMN_ORDER).toEqual([
        'not_client',
        'new',
        'contacted',
        'negotiating',
        'closed_won',
        'closed_lost',
      ]);
    });

    it('CONVERSATION_STAGE_ORDER continua com 5 estágios — o funil do Analytics não herda a coluna nova', () => {
      expect(CONVERSATION_STAGE_ORDER).toHaveLength(5);
      expect(CONVERSATION_STAGE_ORDER).not.toContain(NOT_CLIENT_COLUMN);
    });

    it('rotula a coluna derivada e delega os estágios reais a formatConversationStageLabel', () => {
      expect(formatPipelineColumnLabel(NOT_CLIENT_COLUMN)).toBe('Não cliente');
      expect(formatPipelineColumnLabel('negotiating')).toBe('Negociando');
      expect(formatPipelineColumnLabel('closed_won')).toBe('Fechado');
    });
  });

  describe('pipelineColumnDotClassName (reskin 2026-08-07, Design System: ponto colorido no cabeçalho da coluna)', () => {
    it('neutro para Não cliente/Novo/Contatado', () => {
      expect(pipelineColumnDotClassName('not_client')).toBe('bg-muted-foreground');
      expect(pipelineColumnDotClassName('new')).toBe('bg-muted-foreground');
      expect(pipelineColumnDotClassName('contacted')).toBe('bg-muted-foreground');
    });

    it('âmbar para Negociando, verde para Fechado, vermelho para Perdido', () => {
      expect(pipelineColumnDotClassName('negotiating')).toBe('bg-warning');
      expect(pipelineColumnDotClassName('closed_won')).toBe('bg-success');
      expect(pipelineColumnDotClassName('closed_lost')).toBe('bg-destructive');
    });
  });

  describe('formatElapsedDays (Fase 1, Bloco F1.7)', () => {
    // Fase 1, Bloco F1.10 (estabilidade para beta): "agora" precisa ser
    // FIXO via fake timers — antes este bloco usava `Date.now()`/`new Date()`
    // reais, e o caso "há 1 dia" (montado às 9h de ontem) virava flaky
    // dependendo da hora real de execução (ex.: rodando às 2h da manhã, a
    // diferença real é de 17h, não um dia de calendário completo).
    // "Agora" fixo em 2026-08-05T15:00:00Z (meio da tarde, não uma borda de
    // dia) elimina a dependência do relógio da máquina.
    const NOW = new Date('2026-08-05T15:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(NOW);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('devolve "—" para entrada ausente ou inválida', () => {
      expect(formatElapsedDays(undefined)).toBe('—');
      expect(formatElapsedDays('data-invalida')).toBe('—');
    });

    it('"agora há pouco" para menos de 1h atrás', () => {
      const thirtyMinAgo = new Date(NOW.getTime() - 30 * 60 * 1000).toISOString();
      expect(formatElapsedDays(thirtyMinAgo)).toBe('agora há pouco');
    });

    it('"há Xh" para o mesmo dia, 1h ou mais atrás', () => {
      const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString();
      expect(formatElapsedDays(threeHoursAgo)).toBe('há 3h');
    });

    it('"há 1 dia" para ontem (calendário, não múltiplo de 24h)', () => {
      const yesterday = new Date(NOW);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(9, 0, 0, 0);
      expect(formatElapsedDays(yesterday.toISOString())).toBe('há 1 dia');
    });

    it('"há N dias" para vários dias atrás', () => {
      const fiveDaysAgo = new Date(NOW);
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      fiveDaysAgo.setHours(9, 0, 0, 0);
      expect(formatElapsedDays(fiveDaysAgo.toISOString())).toBe('há 5 dias');
    });
  });

  describe('isSummaryOutdated (Redesign 2026-08-05, R5)', () => {
    it('false quando nenhum resumo foi gerado ainda (aiSummaryUpdatedAt ausente)', () => {
      expect(isSummaryOutdated('2026-08-06T12:00:00.000Z', undefined)).toBe(false);
    });

    it('false quando não há nenhuma mensagem ainda (lastMessageAt ausente)', () => {
      expect(isSummaryOutdated(undefined, '2026-08-06T12:00:00.000Z')).toBe(false);
    });

    it('true quando a última mensagem é posterior à última geração do resumo', () => {
      expect(isSummaryOutdated('2026-08-06T12:00:00.000Z', '2026-08-06T10:00:00.000Z')).toBe(true);
    });

    it('false quando a última geração do resumo é posterior (ou igual) à última mensagem', () => {
      expect(isSummaryOutdated('2026-08-06T10:00:00.000Z', '2026-08-06T12:00:00.000Z')).toBe(false);
      expect(isSummaryOutdated('2026-08-06T10:00:00.000Z', '2026-08-06T10:00:00.000Z')).toBe(false);
    });

    it('false para datas inválidas (não lança)', () => {
      expect(isSummaryOutdated('data-invalida', '2026-08-06T10:00:00.000Z')).toBe(false);
    });
  });

  describe('formatPhoneNumber (Redesign 2026-08-05, R3)', () => {
    it('formata um número brasileiro de 9 dígitos com máscara', () => {
      expect(formatPhoneNumber('5511981224471@s.whatsapp.net')).toBe('+55 (11) 98122-4471');
    });

    it('formata um número brasileiro de 8 dígitos (linha fixa) com máscara', () => {
      expect(formatPhoneNumber('551133334444@s.whatsapp.net')).toBe('+55 (11) 3333-4444');
    });

    it('devolve o número cru quando não bate com o padrão BR (evita mascarar errado)', () => {
      expect(formatPhoneNumber('12345@s.whatsapp.net')).toBe('12345');
    });

    it('devolve o número cru para um JID de grupo/formato diferente', () => {
      expect(formatPhoneNumber('123456789@g.us')).toBe('123456789');
    });

    it('mostra rótulo claro (não os dígitos crus) para um contato com LID (correção 2026-08-07)', () => {
      expect(formatPhoneNumber('225236742053984@lid')).toBe('Número privado (WhatsApp)');
    });
  });

  describe('formatClientSince (Redesign 2026-08-05, R3)', () => {
    it('"menos de 1 mês" para uma data de menos de 30 dias', () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      expect(formatClientSince(tenDaysAgo.toISOString())).toBe('menos de 1 mês');
    });

    it('"N meses" para uma data de alguns meses atrás, mesmo ano', () => {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      expect(formatClientSince(threeMonthsAgo.toISOString())).toBe('3 meses');
    });

    it('"1 ano" para uma data de exatos 12 meses atrás', () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      expect(formatClientSince(oneYearAgo.toISOString())).toBe('1 ano');
    });

    it('"1 ano e N meses" combinando anos e meses', () => {
      const date = new Date();
      date.setFullYear(date.getFullYear() - 1);
      date.setMonth(date.getMonth() - 2);
      expect(formatClientSince(date.toISOString())).toBe('1 ano e 2 meses');
    });

    it('devolve "—" para entrada ausente/inválida', () => {
      expect(formatClientSince(undefined)).toBe('—');
      expect(formatClientSince('not-a-date')).toBe('—');
    });
  });

  describe('formatDayDivider / isSameCalendarDay (Redesign 2026-08-05, R3)', () => {
    it('"Hoje" para a data de hoje', () => {
      expect(formatDayDivider(new Date().toISOString())).toBe('Hoje');
    });

    it('"Ontem" para a data de ontem', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatDayDivider(yesterday.toISOString())).toBe('Ontem');
    });

    it('data curta pt-BR para datas mais antigas', () => {
      expect(formatDayDivider('2026-01-15T12:00:00.000Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it('isSameCalendarDay compara pelo dia local, não pelo instante exato', () => {
      // Horários de meio-dia, de propósito — evita depender do fuso horário
      // da máquina que roda o teste (perto da meia-noite UTC, a comparação
      // por dia LOCAL pode divergir do dia UTC dependendo do fuso).
      expect(isSameCalendarDay('2026-08-05T12:00:00.000Z', '2026-08-05T14:00:00.000Z')).toBe(true);
      expect(isSameCalendarDay('2026-08-05T12:00:00.000Z', '2026-08-06T12:00:00.000Z')).toBe(false);
    });

    it('isSameCalendarDay devolve false para entrada inválida', () => {
      expect(isSameCalendarDay('not-a-date', '2026-08-05T01:00:00.000Z')).toBe(false);
    });
  });
});

/**
 * Onda 1 do redesign (2026-08-22) — numeros para humanos. Ate esta rodada a
 * tela de Analytics exibia "US$ 0.00000000" em destaque de 25px: a string
 * decimal crua do banco (`Decimal(12,8)`) tratada como se fosse informacao
 * de negocio.
 */
describe('formatCostUsd (Onda 1 do redesign)', () => {
  it('zero exato vira "US$ 0,00" — nao a string crua de 8 casas', () => {
    expect(formatCostUsd('0.00000000')).toBe('US$ 0,00');
    expect(formatCostUsd('0')).toBe('US$ 0,00');
  });

  it('valor abaixo de um centavo NAO e arredondado para zero — isso seria mentira', () => {
    // Houve custo; dizer "US$ 0,00" faria o operador acreditar que nao houve.
    expect(formatCostUsd('0.00003421')).toBe('menos de US$ 0,01');
    expect(formatCostUsd('0.009')).toBe('menos de US$ 0,01');
  });

  it('valor normal sai como moeda pt-BR com 2 casas', () => {
    expect(formatCostUsd('1.23456789')).toMatch(/^US\$\s?1,23$/);
    expect(formatCostUsd('0.01')).toMatch(/^US\$\s?0,01$/);
  });

  it('separador de milhar em valores grandes', () => {
    expect(formatCostUsd('1234.5')).toMatch(/1\.234,50$/);
  });

  it('entrada nao numerica cai no valor exato, nunca em NaN', () => {
    expect(formatCostUsd('nao-e-numero')).toBe('US$ nao-e-numero');
  });

  it('formatCostUsdExact preserva a precisao completa para auditoria', () => {
    expect(formatCostUsdExact('0.00003421')).toBe('US$ 0.00003421');
  });
});

describe('formatCount (Onda 1 do redesign)', () => {
  it('aplica separador de milhar pt-BR', () => {
    expect(formatCount(1234)).toBe('1.234');
    expect(formatCount(1234567)).toBe('1.234.567');
  });

  it('abaixo de mil o resultado e identico ao anterior — nenhuma tela regride', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(42)).toBe('42');
  });
});

describe('formatMessageTime (reskin 2026-08-27 — horário dentro da bolha)', () => {
  it('devolve apenas hora e minuto, sem data e sem segundos', () => {
    // 2026-07-24T12:31:00Z. O teste roda no fuso da máquina, então a asserção
    // é sobre o FORMATO (HH:MM), não sobre o valor absoluto da hora.
    expect(formatMessageTime('2026-07-24T12:31:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('devolve "—" para entrada ausente', () => {
    expect(formatMessageTime(undefined)).toBe('—');
  });

  it('devolve "—" para string inválida', () => {
    expect(formatMessageTime('não é uma data')).toBe('—');
  });
});
