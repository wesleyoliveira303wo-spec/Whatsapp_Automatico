import {
  buildSendWindow,
  clampRecurrenceIntervalHours,
  computeNextRunAt,
  decideNextRun,
  isRecurring,
  isWithinSendWindow,
  parseClockTime,
  shiftIntoSendWindow,
} from '../../../src/services/groupBroadcasts/domain/policies/groupBroadcastRecurrence';

const SAO_PAULO = 'America/Sao_Paulo';

/** Hora local — a janela usa o relógio do servidor (limitação documentada). */
function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 8, day, hour, minute, 0, 0);
}

describe('parseClockTime / buildSendWindow', () => {
  it('aceita "HH:MM" e recusa o resto', () => {
    expect(parseClockTime('08:30')).toBe(510);
    expect(parseClockTime('00:00')).toBe(0);
    expect(parseClockTime('24:00')).toBeUndefined();
    expect(parseClockTime('8:30')).toBeUndefined();
    expect(parseClockTime(undefined)).toBeUndefined();
  });

  it('janela só existe com início e fim válidos e DIFERENTES (igual travaria a recorrência)', () => {
    expect(buildSendWindow('08:00', '20:00')).toEqual({ startMinute: 480, endMinute: 1200 });
    expect(buildSendWindow('08:00', '08:00')).toBeUndefined();
    expect(buildSendWindow('08:00', undefined)).toBeUndefined();
    expect(buildSendWindow('xx', '20:00')).toBeUndefined();
  });
});

describe('isWithinSendWindow', () => {
  const dia = buildSendWindow('08:00', '20:00');
  const noite = buildSendWindow('22:00', '06:00');

  it('sem janela, qualquer hora vale', () => {
    expect(isWithinSendWindow(at(1, 3), undefined)).toBe(true);
  });

  it('janela normal', () => {
    expect(isWithinSendWindow(at(1, 8), dia)).toBe(true);
    expect(isWithinSendWindow(at(1, 19, 59), dia)).toBe(true);
    expect(isWithinSendWindow(at(1, 20), dia)).toBe(false);
    expect(isWithinSendWindow(at(1, 7, 59), dia)).toBe(false);
  });

  it('janela que vira a noite', () => {
    expect(isWithinSendWindow(at(1, 23), noite)).toBe(true);
    expect(isWithinSendWindow(at(1, 5), noite)).toBe(true);
    expect(isWithinSendWindow(at(1, 12), noite)).toBe(false);
  });
});

describe('shiftIntoSendWindow', () => {
  const dia = buildSendWindow('08:00', '20:00');

  it('dentro da janela, não mexe', () => {
    const instante = at(1, 10);
    expect(shiftIntoSendWindow(instante, dia)).toBe(instante);
  });

  it('de madrugada, empurra para a abertura do MESMO dia', () => {
    expect(shiftIntoSendWindow(at(1, 3), dia)).toEqual(at(1, 8));
  });

  it('depois do fechamento, empurra para a abertura do dia SEGUINTE', () => {
    expect(shiftIntoSendWindow(at(1, 22), dia)).toEqual(at(2, 8));
  });
});

describe('janela avaliada em fuso explícito (achado real de produção, 2026-09-13)', () => {
  // Janela "06:00 às 22:00" em America/Sao_Paulo (UTC-3, sem DST desde 2019).
  const janela = buildSendWindow('06:00', '22:00');

  it('06:00 BRT (09:00 UTC) já está dentro da janela; 05:59 BRT (08:59 UTC) ainda não', () => {
    expect(isWithinSendWindow(new Date('2026-09-14T09:00:00Z'), janela, SAO_PAULO)).toBe(true);
    expect(isWithinSendWindow(new Date('2026-09-14T08:59:00Z'), janela, SAO_PAULO)).toBe(false);
  });

  it('03:00 BRT (06:00 UTC, madrugada) fica FORA da janela — era o bug relatado (publicação de madrugada)', () => {
    expect(isWithinSendWindow(new Date('2026-09-14T06:00:00Z'), janela, SAO_PAULO)).toBe(false);
  });

  it('19:00 BRT (22:00 UTC) ainda está dentro; 22:00 BRT (01:00 UTC do dia seguinte) já fechou', () => {
    expect(isWithinSendWindow(new Date('2026-09-14T22:00:00Z'), janela, SAO_PAULO)).toBe(true);
    expect(isWithinSendWindow(new Date('2026-09-15T01:00:00Z'), janela, SAO_PAULO)).toBe(false);
  });

  it('shiftIntoSendWindow empurra uma publicação de madrugada (BRT) para as 06:00 BRT do MESMO dia', () => {
    const madrugada = new Date('2026-09-14T06:00:00Z'); // 03:00 BRT
    const empurrado = shiftIntoSendWindow(madrugada, janela, SAO_PAULO);
    expect(empurrado.toISOString()).toBe('2026-09-14T09:00:00.000Z'); // 06:00 BRT
  });

  it('shiftIntoSendWindow depois do fechamento empurra para a abertura do dia SEGUINTE, no fuso certo', () => {
    const depoisDoFechamento = new Date('2026-09-15T02:00:00Z'); // 23:00 BRT do dia 14 (já fechou às 22h)
    const empurrado = shiftIntoSendWindow(depoisDoFechamento, janela, SAO_PAULO);
    expect(empurrado.toISOString()).toBe('2026-09-15T09:00:00.000Z'); // 06:00 BRT do dia 15
  });

  it('sem `timeZone` explícito, preserva o comportamento antigo (relógio do processo) — compatibilidade', () => {
    // Mesmo teste de `shiftIntoSendWindow` acima, mas usando Date local (não UTC) e sem passar timeZone.
    const dia = buildSendWindow('08:00', '20:00');
    const madrugadaLocal = new Date(2026, 8, 1, 3, 0, 0, 0);
    expect(shiftIntoSendWindow(madrugadaLocal, dia)).toEqual(new Date(2026, 8, 1, 8, 0, 0, 0));
  });

  it('fuso inválido degrada graciosamente (nunca trava a recorrência)', () => {
    expect(isWithinSendWindow(new Date('2026-09-14T06:00:00Z'), janela, 'Nao/Existe')).toBe(true);
    const instante = new Date('2026-09-14T06:00:00Z');
    expect(shiftIntoSendWindow(instante, janela, 'Nao/Existe')).toBe(instante);
  });
});

describe('clampRecurrenceIntervalHours', () => {
  it('mantém o que está na faixa e traz o resto para dentro dela', () => {
    expect(clampRecurrenceIntervalHours(3)).toBe(3);
    expect(clampRecurrenceIntervalHours(0)).toBe(1);
    expect(clampRecurrenceIntervalHours(99)).toBe(24);
    expect(clampRecurrenceIntervalHours(undefined)).toBe(1);
    expect(clampRecurrenceIntervalHours(null)).toBe(1);
  });
});

describe('isRecurring', () => {
  it('só é recorrente com intervalo definido', () => {
    expect(isRecurring({ recurrenceIntervalHours: 2 })).toBe(true);
    expect(isRecurring({ recurrenceIntervalHours: undefined })).toBe(false);
  });
});

describe('computeNextRunAt', () => {
  it('soma o intervalo e respeita a janela', () => {
    expect(computeNextRunAt(at(1, 10), 2, undefined)).toEqual(at(1, 12));
    // 19h + 2h = 21h, fora da janela → abre às 8h do dia seguinte.
    expect(computeNextRunAt(at(1, 19), 2, buildSendWindow('08:00', '20:00'))).toEqual(at(2, 8));
  });
});

describe('decideNextRun — as três formas de término convivem', () => {
  const base = {
    recurrenceIntervalHours: 2,
    recurrenceMaxRuns: undefined,
    recurrenceEndsAt: undefined,
    runsCompleted: 0,
  };

  it('"até eu cancelar" (sem limites): sempre repete', () => {
    const decisao = decideNextRun(base, undefined, at(1, 10));
    expect(decisao).toEqual({ shouldRepeat: true, nextRunAt: at(1, 12) });
  });

  it('teto de repetições: repete até faltar uma, e encerra na última', () => {
    expect(
      decideNextRun({ ...base, recurrenceMaxRuns: 3, runsCompleted: 1 }, undefined, at(1, 10)),
    ).toEqual({ shouldRepeat: true, nextRunAt: at(1, 12) });
    expect(
      decideNextRun({ ...base, recurrenceMaxRuns: 3, runsCompleted: 2 }, undefined, at(1, 10)),
    ).toEqual({ shouldRepeat: false, reason: 'max_runs_reached' });
  });

  it('data de término: encerra quando a PRÓXIMA cairia depois do limite', () => {
    expect(
      decideNextRun({ ...base, recurrenceEndsAt: at(1, 13) }, undefined, at(1, 10)),
    ).toEqual({ shouldRepeat: true, nextRunAt: at(1, 12) });
    expect(
      decideNextRun({ ...base, recurrenceEndsAt: at(1, 11) }, undefined, at(1, 10)),
    ).toEqual({ shouldRepeat: false, reason: 'end_date_reached' });
  });

  it('com os dois limites, vale o que vier primeiro', () => {
    expect(
      decideNextRun(
        { ...base, recurrenceMaxRuns: 2, recurrenceEndsAt: at(9, 0), runsCompleted: 1 },
        undefined,
        at(1, 10),
      ),
    ).toEqual({ shouldRepeat: false, reason: 'max_runs_reached' });
  });
});
