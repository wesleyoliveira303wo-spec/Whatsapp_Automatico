import { computeSendDelayMs } from '../../../../src/services/campaigns/domain/policies/computeSendDelayMs';

const NOW = new Date('2026-08-17T12:00:00.000'); // meio-dia, horário local do processo de teste

describe('computeSendDelayMs (Fase L, Bloco L4)', () => {
  it('índice 0 tem delay igual ao jitter (sem janela de horário)', () => {
    const delay = computeSendDelayMs(0, {
      intervalBaseMs: 75_000,
      jitterMaxMs: 10_000,
      now: NOW,
      randomFn: () => 0.5,
    });
    expect(delay).toBe(5_000); // 0*75000 + 0.5*10000
  });

  it('índice N soma N intervalos-base ao jitter', () => {
    const delay = computeSendDelayMs(3, {
      intervalBaseMs: 75_000,
      jitterMaxMs: 10_000,
      now: NOW,
      randomFn: () => 0,
    });
    expect(delay).toBe(225_000); // 3*75000 + 0
  });

  it('jitter varia com randomFn, sempre dentro de [0, jitterMaxMs)', () => {
    const delayLow = computeSendDelayMs(0, {
      intervalBaseMs: 0,
      jitterMaxMs: 20_000,
      now: NOW,
      randomFn: () => 0,
    });
    const delayHigh = computeSendDelayMs(0, {
      intervalBaseMs: 0,
      jitterMaxMs: 20_000,
      now: NOW,
      randomFn: () => 0.999,
    });
    expect(delayLow).toBe(0);
    expect(delayHigh).toBeLessThan(20_000);
    expect(delayHigh).toBeGreaterThan(delayLow);
  });

  it('sem janela de horário configurada: nunca empurra o delay', () => {
    const delay = computeSendDelayMs(0, {
      intervalBaseMs: 0,
      jitterMaxMs: 0,
      now: NOW,
      randomFn: () => 0,
    });
    expect(delay).toBe(0);
  });

  it('dentro da janela: não empurra o delay', () => {
    // NOW é meio-dia; janela 09:00-18:00 já inclui o horário atual.
    const delay = computeSendDelayMs(0, {
      intervalBaseMs: 0,
      jitterMaxMs: 0,
      sendWindowStart: '09:00',
      sendWindowEnd: '18:00',
      now: NOW,
      randomFn: () => 0,
    });
    expect(delay).toBe(0);
  });

  it('antes da janela abrir hoje: empurra para o início da janela HOJE', () => {
    const early = new Date('2026-08-17T04:00:00.000'); // 4h da manhã
    const delay = computeSendDelayMs(0, {
      intervalBaseMs: 0,
      jitterMaxMs: 0,
      sendWindowStart: '09:00',
      sendWindowEnd: '18:00',
      now: early,
      randomFn: () => 0,
    });
    const target = new Date(early.getTime() + delay);
    expect(target.getHours()).toBe(9);
    expect(target.getMinutes()).toBe(0);
    expect(target.getDate()).toBe(early.getDate());
  });

  it('depois da janela fechar hoje: empurra para o início da janela AMANHÃ', () => {
    const late = new Date('2026-08-17T22:00:00.000'); // 22h
    const delay = computeSendDelayMs(0, {
      intervalBaseMs: 0,
      jitterMaxMs: 0,
      sendWindowStart: '09:00',
      sendWindowEnd: '18:00',
      now: late,
      randomFn: () => 0,
    });
    const target = new Date(late.getTime() + delay);
    expect(target.getHours()).toBe(9);
    expect(target.getDate()).toBe(late.getDate() + 1);
  });

  it('delay que cai fora da janela (índice alto) também é empurrado, não só o índice 0', () => {
    // índice grande o suficiente para o delay-base ultrapassar as 18h do mesmo dia.
    const morning = new Date('2026-08-17T10:00:00.000'); // 10h
    const delay = computeSendDelayMs(50, {
      intervalBaseMs: 600_000, // 10 min por passo — 50 passos = ~8h20, estoura a janela
      jitterMaxMs: 0,
      sendWindowStart: '09:00',
      sendWindowEnd: '18:00',
      now: morning,
      randomFn: () => 0,
    });
    const target = new Date(morning.getTime() + delay);
    const minutes = target.getHours() * 60 + target.getMinutes();
    expect(minutes).toBeGreaterThanOrEqual(9 * 60);
    expect(minutes).toBeLessThanOrEqual(18 * 60);
  });

  it('janela com formato inválido (start >= end): não trava o envio, ignora a janela', () => {
    const delay = computeSendDelayMs(0, {
      intervalBaseMs: 0,
      jitterMaxMs: 0,
      sendWindowStart: '18:00',
      sendWindowEnd: '09:00', // invertida
      now: NOW,
      randomFn: () => 0,
    });
    expect(delay).toBe(0);
  });

  it('nunca devolve delay negativo', () => {
    const delay = computeSendDelayMs(0, {
      intervalBaseMs: 0,
      jitterMaxMs: 0,
      sendWindowStart: '09:00',
      sendWindowEnd: '18:00',
      now: NOW, // já dentro da janela
      randomFn: () => 0,
    });
    expect(delay).toBeGreaterThanOrEqual(0);
  });
});
