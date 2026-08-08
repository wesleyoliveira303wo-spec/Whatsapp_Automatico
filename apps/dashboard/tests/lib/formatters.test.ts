import {
  formatStatusLabel,
  statusBadgeClassName,
  formatDisconnectReasonLabel,
  formatDateTime,
  formatConversationTimestamp,
  formatContactDisplayName,
  formatContactInitials,
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

  describe('formatContactDisplayName (Milestone 6, Bloco M6H-2b)', () => {
    it('usa contactName quando presente', () => {
      expect(formatContactDisplayName('5511999999999@s.whatsapp.net', 'Maria Silva')).toBe(
        'Maria Silva',
      );
    });

    it('cai para o número formatado quando contactName está ausente', () => {
      expect(formatContactDisplayName('5511999999999@s.whatsapp.net')).toBe('5511999999999');
    });

    it('cai para o número formatado quando contactName é só espaços', () => {
      expect(formatContactDisplayName('5511999999999@s.whatsapp.net', '   ')).toBe('5511999999999');
    });
  });

  describe('formatContactInitials (Milestone 6, Bloco M6H-2b)', () => {
    it('usa as iniciais das duas primeiras palavras do contactName', () => {
      expect(formatContactInitials('5511999999999@s.whatsapp.net', 'Maria Silva')).toBe('MS');
    });

    it('usa 1 letra quando contactName tem uma única palavra', () => {
      expect(formatContactInitials('5511999999999@s.whatsapp.net', 'Loja')).toBe('L');
    });

    it('cai para os últimos 2 dígitos do número quando não há contactName', () => {
      expect(formatContactInitials('5511999999999@s.whatsapp.net')).toBe('99');
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
      expect(formatPhoneNumber('5511981224471@s.whatsapp.net')).toBe('+55 11 98122-4471');
    });

    it('formata um número brasileiro de 8 dígitos (linha fixa) com máscara', () => {
      expect(formatPhoneNumber('551133334444@s.whatsapp.net')).toBe('+55 11 3333-4444');
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
