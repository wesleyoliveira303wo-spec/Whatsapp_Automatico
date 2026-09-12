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
