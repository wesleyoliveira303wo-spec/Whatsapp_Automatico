import { GroupBroadcastStep } from '../entities/GroupBroadcast';

/**
 * Recorrência do disparo em grupos (2026-09-11, pedido do fundador: "repetir a
 * cada 1h, 2h, 3h, em diante").
 *
 * Funções PURAS — o processador de fila decide QUANDO chamar, estas só
 * respondem "pode repetir?" e "a que horas". Mesmo padrão de
 * `groupBroadcastPacing`/`computeGroupSendDelayMs`.
 *
 * FUSO (corrigido em 2026-09-13 — achado real de produção): a janela de
 * horário é avaliada no fuso de `DEFAULT_GROUP_BROADCAST_TIMEZONE`
 * (`America/Sao_Paulo`), não mais no relógio do PROCESSO do servidor. Em
 * produção o container roda em UTC — antes desta correção, "06:00 às 22:00"
 * era na prática 06:00–22:00 UTC = 03:00–19:00 no horário do fundador (BRT,
 * UTC-3), explicando publicações de madrugada e o horário das 19h nunca sendo
 * atingido. Mesmo padrão de `AiBusinessProfile`/`workingHours.ts`
 * (`Intl.DateTimeFormat` + degradação graciosa num fuso inválido). Fuso por
 * TENANT (configurável) continua extensão futura — hoje é uma constante única,
 * suficiente porque o produto ainda tem só o fundador (Brasil) operando disparos
 * em grupos.
 *
 * As funções aceitam `timeZone` como parâmetro OPCIONAL: ausente preserva o
 * comportamento antigo (relógio do processo) para não quebrar nenhum chamador
 * existente — os processadores de fila (`GroupBroadcastRunJobProcessor`/
 * `GroupBroadcastSendJobProcessor`) é que passam explicitamente
 * `DEFAULT_GROUP_BROADCAST_TIMEZONE`.
 */

/** Uma hora é o mínimo: publicar no mesmo grupo com intervalo menor é o padrão que mais gera denúncia. */
export const MIN_RECURRENCE_INTERVAL_HOURS = 1;
/** 24h = uma vez por dia; acima disso a recorrência deixa de ser "de hora em hora" e vira agendamento de calendário, fora do escopo pedido. */
export const MAX_RECURRENCE_INTERVAL_HOURS = 24;
/** Teto de repetições por disparo — mesmo espírito do teto de 30 grupos: um número que um humano consegue prever. */
export const MAX_RECURRENCE_RUNS = 100;

/** Fuso usado para avaliar a janela de horário — ver docstring do módulo. */
export const DEFAULT_GROUP_BROADCAST_TIMEZONE = 'America/Sao_Paulo';

export interface SendWindow {
  /** Minutos desde a meia-noite. */
  startMinute: number;
  endMinute: number;
}

export type RecurrenceStopReason = 'max_runs_reached' | 'end_date_reached';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `"14:30"` → 870. Formato inválido devolve `undefined` (o chamador trata como "sem janela"). */
export function parseClockTime(value?: string): number | undefined {
  if (!value) return undefined;
  const match = HHMM.exec(value.trim());
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Monta a janela a partir dos dois campos. Só existe janela quando AMBOS são
 * válidos e diferentes — início igual ao fim seria uma janela de duração zero,
 * que travaria a recorrência para sempre; nesse caso vale "sem janela".
 */
export function buildSendWindow(start?: string, end?: string): SendWindow | undefined {
  const startMinute = parseClockTime(start);
  const endMinute = parseClockTime(end);
  if (startMinute === undefined || endMinute === undefined || startMinute === endMinute) {
    return undefined;
  }
  return { startMinute, endMinute };
}

function minuteOfDay(date: Date, timeZone?: string): number {
  if (!timeZone) {
    return date.getHours() * 60 + date.getMinutes();
  }
  const parts = formatZoneParts(date, timeZone, { hour: '2-digit', minute: '2-digit' });
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/** Extrai partes de data/hora de `date` no fuso `timeZone`. Lança para fuso inválido — quem chama decide a degradação. */
function formatZoneParts(
  date: Date,
  timeZone: string,
  fields: Intl.DateTimeFormatOptions,
): Record<string, string> {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', ...fields });
  const parts: Record<string, string> = {};
  dtf.formatToParts(date).forEach(({ type, value }) => {
    parts[type] = value;
  });
  return parts;
}

/** Deslocamento (ms) do fuso `timeZone` em relação a UTC, no instante `date`. */
function timezoneOffsetMs(date: Date, timeZone: string): number {
  const p = formatZoneParts(date, timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - date.getTime();
}

/** Ano/mês/dia de `date` como visto no fuso `timeZone`. */
function localDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const p = formatZoneParts(date, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
}

/** Instante UTC cujo relógio de parede, NO FUSO `timeZone`, marca `year-month-day` às `minuteOfDay`. */
function zonedWallTimeToInstant(
  year: number,
  month: number,
  day: number,
  minuteOfDayValue: number,
  timeZone: string,
): Date {
  const hour = Math.floor(minuteOfDayValue / 60);
  const minute = minuteOfDayValue % 60;
  const approx = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  // O deslocamento pode variar perto de uma virada de horário de verão — recalcular
  // uma vez contra a aproximação já é suficiente para o uso aqui (janela em minutos).
  const offsetMs = timezoneOffsetMs(approx, timeZone);
  return new Date(approx.getTime() - offsetMs);
}

/**
 * `true` se o instante cai na janela. Janela que vira a noite (ex.: 22:00–06:00)
 * é suportada: ali o permitido é "depois do início OU antes do fim".
 *
 * `timeZone` ausente preserva o comportamento antigo (relógio do processo);
 * um fuso inválido degrada graciosamente para "dentro da janela" (nunca trava
 * a recorrência por causa de um valor mal formado).
 */
export function isWithinSendWindow(at: Date, window?: SendWindow, timeZone?: string): boolean {
  if (!window) return true;
  let minute: number;
  try {
    minute = minuteOfDay(at, timeZone);
  } catch {
    return true;
  }
  if (window.startMinute < window.endMinute) {
    return minute >= window.startMinute && minute < window.endMinute;
  }
  return minute >= window.startMinute || minute < window.endMinute;
}

/**
 * Empurra o instante para o próximo horário permitido — nunca para trás, nunca
 * descarta a publicação. Já dentro da janela (ou sem janela), devolve o próprio
 * instante. Fuso inválido degrada para "não mexe" (mesma lógica de `isWithinSendWindow`).
 */
export function shiftIntoSendWindow(at: Date, window?: SendWindow, timeZone?: string): Date {
  if (!window || isWithinSendWindow(at, window, timeZone)) return at;

  if (!timeZone) {
    const shifted = new Date(at);
    shifted.setSeconds(0, 0);
    shifted.setHours(Math.floor(window.startMinute / 60), window.startMinute % 60, 0, 0);
    if (shifted.getTime() <= at.getTime()) {
      shifted.setDate(shifted.getDate() + 1);
    }
    return shifted;
  }

  try {
    const today = localDateParts(at, timeZone);
    let shifted = zonedWallTimeToInstant(
      today.year,
      today.month,
      today.day,
      window.startMinute,
      timeZone,
    );
    if (shifted.getTime() <= at.getTime()) {
      const tomorrow = localDateParts(new Date(at.getTime() + 24 * 60 * 60 * 1000), timeZone);
      shifted = zonedWallTimeToInstant(
        tomorrow.year,
        tomorrow.month,
        tomorrow.day,
        window.startMinute,
        timeZone,
      );
    }
    return shifted;
  } catch {
    return at;
  }
}

/**
 * Duração da janela em minutos — suporta a janela que vira a noite (ex.:
 * 22:00–06:00, onde `endMinute < startMinute`).
 */
export function windowDurationMinutes(window: SendWindow): number {
  if (window.startMinute < window.endMinute) return window.endMinute - window.startMinute;
  return 24 * 60 - window.startMinute + window.endMinute;
}

/**
 * Trava o escalonamento entre publicações (`launchOffsetMs`) para nunca
 * empurrar uma repetição para FORA da janela que acabou de abri-la — sem
 * isso, uma etapa de `order` alto (ou um escalonamento largo) somado à
 * abertura da janela podia cair depois do fechamento dela; a repetição
 * seguinte veria "fora da janela" de novo, seria reagendada para a MESMA
 * abertura + o MESMO offset, e nunca publicaria — presa num loop diário
 * silencioso (achado real de produção, 2026-09-16, ao ampliar o
 * escalonamento para valer mesmo com `runsCompleted > 0`: campanhas com
 * várias etapas + janela estreita ficariam mudas para sempre). Sem janela
 * definida, não há teto — não existe "fora" para cair.
 */
export function capOffsetWithinWindow(offsetMs: number, window?: SendWindow): number {
  if (!window || offsetMs <= 0) return offsetMs;
  const maxOffsetMs = Math.max(0, windowDurationMinutes(window) - 1) * 60 * 1000;
  return Math.min(offsetMs, maxOffsetMs);
}

/** Ausente/inválido vira o mínimo; fora da faixa é trazido para dentro dela. */
export function clampRecurrenceIntervalHours(requested?: number | null): number {
  if (requested === undefined || requested === null || !Number.isFinite(requested)) {
    return MIN_RECURRENCE_INTERVAL_HOURS;
  }
  const rounded = Math.round(requested);
  return Math.min(MAX_RECURRENCE_INTERVAL_HOURS, Math.max(MIN_RECURRENCE_INTERVAL_HOURS, rounded));
}

/** `true` quando a ETAPA foi criada para se repetir (ausente = publica uma vez, depois avança/encerra). */
export function isRecurring(step: Pick<GroupBroadcastStep, 'recurrenceIntervalHours'>): boolean {
  return step.recurrenceIntervalHours !== undefined && step.recurrenceIntervalHours !== null;
}

/**
 * Quando a próxima repetição deve começar: o intervalo contado a partir do fim
 * da repetição anterior, já empurrado para dentro da janela de horário.
 *
 * `launchOffsetMsValue` (2026-09-16, 2ª correção — achado real de produção: o
 * fix anterior só cobria `GroupBroadcastRunJobProcessor`, que reagenda um job
 * que ACORDOU fora da janela. Este caminho aqui — chamado pelo processador de
 * ENVIO ao fim de todo ciclo bem-sucedido — nunca aplicava o escalonamento, e
 * é ele quem decide o próximo horário na maioria das vezes. Quando várias
 * etapas terminam um ciclo quase no mesmo instante e o próximo horário natural
 * cai fora da janela, TODAS eram empurradas pro MESMO horário de abertura,
 * coladas para sempre — mesmo com o fix anterior). Só é somado quando o
 * horário natural (sem escalonamento) já caía FORA da janela — se já cai
 * dentro, a etapa segue seu próprio relógio sem interferência, como sempre.
 */
export function computeNextRunAt(
  finishedAt: Date,
  intervalHours: number,
  window?: SendWindow,
  timeZone?: string,
  launchOffsetMsValue = 0,
): Date {
  const target = new Date(
    finishedAt.getTime() + clampRecurrenceIntervalHours(intervalHours) * 60 * 60 * 1000,
  );
  if (!window || isWithinSendWindow(target, window, timeZone)) {
    return target;
  }
  const windowOpen = shiftIntoSendWindow(target, window, timeZone);
  return new Date(windowOpen.getTime() + capOffsetWithinWindow(launchOffsetMsValue, window));
}

export type RecurrenceDecision =
  | { shouldRepeat: true; nextRunAt: Date }
  | { shouldRepeat: false; reason: RecurrenceStopReason };

/**
 * Decide o destino de UMA ETAPA depois de uma repetição terminar.
 *
 * As TRÊS formas de término do fundador convivem e são independentes: teto de
 * repetições, data/hora limite, e "até eu cancelar" (nenhum dos dois
 * preenchido). Quando os dois limites existem, vale o que vier primeiro — a
 * checagem é feita sobre o instante da PRÓXIMA publicação, não sobre agora:
 * uma etapa cuja próxima repetição cairia depois do limite simplesmente
 * encerra (o processador de fila decide então se avança para a próxima etapa
 * ou completa a campanha), em vez de publicar uma vez a mais fora do
 * combinado.
 *
 * Cancelar ou pausar não passa por aqui: aquilo muda o `status` da campanha,
 * e o processador nem chega a perguntar.
 */
export function decideNextRun(
  step: Pick<
    GroupBroadcastStep,
    'recurrenceIntervalHours' | 'recurrenceMaxRuns' | 'recurrenceEndsAt' | 'runsCompleted'
  >,
  window: SendWindow | undefined,
  finishedAt: Date,
  timeZone?: string,
  launchOffsetMsValue = 0,
): RecurrenceDecision {
  const runsCompleted = step.runsCompleted + 1;
  const maxRuns = step.recurrenceMaxRuns;
  if (maxRuns !== undefined && maxRuns !== null && runsCompleted >= maxRuns) {
    return { shouldRepeat: false, reason: 'max_runs_reached' };
  }

  const nextRunAt = computeNextRunAt(
    finishedAt,
    step.recurrenceIntervalHours ?? MIN_RECURRENCE_INTERVAL_HOURS,
    window,
    timeZone,
    launchOffsetMsValue,
  );

  const endsAt = step.recurrenceEndsAt;
  if (endsAt && nextRunAt.getTime() > endsAt.getTime()) {
    return { shouldRepeat: false, reason: 'end_date_reached' };
  }

  return { shouldRepeat: true, nextRunAt };
}
