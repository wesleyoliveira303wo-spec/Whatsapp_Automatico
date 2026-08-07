/**
 * Testes unitários de `workingHours.ts` (F1.8, 2026-08-01) — funções puras
 * `isWithinWorkingHours` e `getOffHoursContext`. Toda lógica de fuso horário
 * é testada via injeção do parâmetro `now` (evita flakiness por hora de
 * execução), usando o mesmo padrão de injeção adotado em `shouldReactivateBot`
 * e `buildMessagePreview`.
 *
 * Estratégia de fuso:
 *   - Testes de dia/hora usam "America/Sao_Paulo" (UTC-3) para evitar
 *     ambiguidades. A data `2026-08-05T12:00:00Z` = quarta-feira 09h00 em
 *     SP — escolhida por ser bem no meio de um dia de semana.
 *   - Testes de degradação graciosa usam timezone inválido para verificar
 *     o comportamento de fallback (`true` = "dentro do horário").
 */
import { isWithinWorkingHours, getOffHoursContext, type WorkingHoursConfig } from './workingHours';

/**
 * Quarta-feira, 2026-08-05, 09h00 em America/Sao_Paulo (= 12h00 UTC).
 * Bit 3 no bitmask (0-indexed Domingo=0) → Wednesday = bit 3 = valor 8.
 * Mon–Sex = bits 1–5 = 0b0111110 = 62.
 */
const WED_09H00_SP = new Date('2026-08-05T12:00:00Z');

/** Sábado, 2026-08-08, 10h00 em America/Sao_Paulo (= 13h00 UTC). bit 6. */
const SAT_10H00_SP = new Date('2026-08-08T13:00:00Z');

/** Segunda, 2026-08-03, 20h30 em America/Sao_Paulo (= 23h30 UTC). */
const MON_20H30_SP = new Date('2026-08-03T23:30:00Z');

function baseConfig(overrides: Partial<WorkingHoursConfig> = {}): WorkingHoursConfig {
  return {
    offHoursEnabled: true,
    offHoursMessage: null,
    workingHoursStart: '08:00',
    workingHoursEnd: '18:00',
    workingDays: 62, // Mon–Sex
    timezone: 'America/Sao_Paulo',
    ...overrides,
  };
}

// ─── isWithinWorkingHours ──────────────────────────────────────────────────

describe('isWithinWorkingHours', () => {
  it('retorna true quando offHoursEnabled é false, independente do horário', () => {
    expect(isWithinWorkingHours(baseConfig({ offHoursEnabled: false }), SAT_10H00_SP)).toBe(true);
  });

  it('retorna true quando workingHoursStart é null (horário não configurado)', () => {
    expect(isWithinWorkingHours(baseConfig({ workingHoursStart: null }), SAT_10H00_SP)).toBe(true);
  });

  it('retorna true quando workingHoursEnd é null (horário não configurado)', () => {
    expect(isWithinWorkingHours(baseConfig({ workingHoursEnd: null }), SAT_10H00_SP)).toBe(true);
  });

  it('quarta 09h00 dentro de 08:00–18:00 em dias úteis → dentro do horário', () => {
    expect(isWithinWorkingHours(baseConfig(), WED_09H00_SP)).toBe(true);
  });

  it('sábado 10h00 fora dos dias úteis (workingDays=62) → fora do horário', () => {
    expect(isWithinWorkingHours(baseConfig(), SAT_10H00_SP)).toBe(false);
  });

  it('segunda 20h30 após 18:00 → fora do horário', () => {
    expect(isWithinWorkingHours(baseConfig(), MON_20H30_SP)).toBe(false);
  });

  it('horário de fim igual ao de início: nunca dentro (janela vazia)', () => {
    // 09:00 <= 09:00 < 09:00 é falso — comportamento documentado no CLAUDE.md
    expect(
      isWithinWorkingHours(
        baseConfig({ workingHoursStart: '09:00', workingHoursEnd: '09:00' }),
        WED_09H00_SP,
      ),
    ).toBe(false);
  });

  it('workingDays=0 (nenhum dia): nunca dentro do horário', () => {
    expect(isWithinWorkingHours(baseConfig({ workingDays: 0 }), WED_09H00_SP)).toBe(false);
  });

  it('workingDays=127 (todos os dias): sábado dentro do horário', () => {
    expect(isWithinWorkingHours(baseConfig({ workingDays: 127 }), SAT_10H00_SP)).toBe(true);
  });

  it('timezone inválido → degradação graciosa: retorna true ("dentro do horário")', () => {
    expect(
      isWithinWorkingHours(baseConfig({ timezone: 'Invalid/Timezone_XYZ' }), WED_09H00_SP),
    ).toBe(true);
  });
});

// ─── getOffHoursContext ────────────────────────────────────────────────────

describe('getOffHoursContext', () => {
  it('retorna undefined quando offHoursEnabled é false (dentro do horário = não injeta aviso)', () => {
    expect(
      getOffHoursContext(baseConfig({ offHoursEnabled: false }), WED_09H00_SP),
    ).toBeUndefined();
  });

  it('retorna undefined quando dentro do horário configurado', () => {
    expect(getOffHoursContext(baseConfig(), WED_09H00_SP)).toBeUndefined();
  });

  it('retorna string quando fora do horário (sábado fora dos dias úteis)', () => {
    const result = getOffHoursContext(baseConfig(), SAT_10H00_SP);
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect((result as string).length).toBeGreaterThan(0);
  });

  it('retorna string quando fora do horário (segunda após 18h)', () => {
    const result = getOffHoursContext(baseConfig(), MON_20H30_SP);
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('usa offHoursMessage personalizado quando fora do horário', () => {
    const result = getOffHoursContext(
      baseConfig({ offHoursMessage: 'Não estamos disponíveis agora. Retornamos em breve!' }),
      SAT_10H00_SP,
    );
    expect(result).toContain('Não estamos disponíveis agora. Retornamos em breve!');
  });

  it('usa mensagem padrão quando offHoursMessage é null', () => {
    const result = getOffHoursContext(baseConfig({ offHoursMessage: null }), SAT_10H00_SP);
    // A mensagem padrão menciona "horário de atendimento" ou equivalente
    expect(result).toBeDefined();
    expect((result as string).length).toBeGreaterThan(10);
  });

  it('retorna undefined quando timezone inválido (degradação graciosa: assume dentro do horário)', () => {
    expect(
      getOffHoursContext(baseConfig({ timezone: 'Invalid/Timezone_XYZ' }), SAT_10H00_SP),
    ).toBeUndefined();
  });
});
