import { GroupBroadcast } from '../entities/GroupBroadcast';

/**
 * Recorrência do disparo em grupos (2026-09-11, pedido do fundador: "repetir a
 * cada 1h, 2h, 3h, em diante").
 *
 * Funções PURAS — o processador de fila decide QUANDO chamar, estas só
 * respondem "pode repetir?" e "a que horas". Mesmo padrão de
 * `groupBroadcastPacing`/`computeGroupSendDelayMs`.
 *
 * FUSO: a janela de horário usa o relógio do SERVIDOR, mesma simplificação já
 * registrada em `AiBusinessProfile`/`workingHours.ts` e no motor de campanhas.
 * Fuso por tenant continua sendo extensão futura, não um esquecimento.
 */

/** Uma hora é o mínimo: publicar no mesmo grupo com intervalo menor é o padrão que mais gera denúncia. */
export const MIN_RECURRENCE_INTERVAL_HOURS = 1;
/** 24h = uma vez por dia; acima disso a recorrência deixa de ser "de hora em hora" e vira agendamento de calendário, fora do escopo pedido. */
export const MAX_RECURRENCE_INTERVAL_HOURS = 24;
/** Teto de repetições por disparo — mesmo espírito do teto de 30 grupos: um número que um humano consegue prever. */
export const MAX_RECURRENCE_RUNS = 100;

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

function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * `true` se o instante cai na janela. Janela que vira a noite (ex.: 22:00–06:00)
 * é suportada: ali o permitido é "depois do início OU antes do fim".
 */
export function isWithinSendWindow(at: Date, window?: SendWindow): boolean {
  if (!window) return true;
  const minute = minuteOfDay(at);
  if (window.startMinute < window.endMinute) {
    return minute >= window.startMinute && minute < window.endMinute;
  }
  return minute >= window.startMinute || minute < window.endMinute;
}

/**
 * Empurra o instante para o próximo horário permitido — nunca para trás, nunca
 * descarta a publicação. Já dentro da janela (ou sem janela), devolve o próprio
 * instante.
 */
export function shiftIntoSendWindow(at: Date, window?: SendWindow): Date {
  if (isWithinSendWindow(at, window) || !window) return at;
  const shifted = new Date(at);
  shifted.setSeconds(0, 0);
  shifted.setHours(Math.floor(window.startMinute / 60), window.startMinute % 60, 0, 0);
  if (shifted.getTime() <= at.getTime()) {
    shifted.setDate(shifted.getDate() + 1);
  }
  return shifted;
}

/** Ausente/inválido vira o mínimo; fora da faixa é trazido para dentro dela. */
export function clampRecurrenceIntervalHours(requested?: number | null): number {
  if (requested === undefined || requested === null || !Number.isFinite(requested)) {
    return MIN_RECURRENCE_INTERVAL_HOURS;
  }
  const rounded = Math.round(requested);
  return Math.min(MAX_RECURRENCE_INTERVAL_HOURS, Math.max(MIN_RECURRENCE_INTERVAL_HOURS, rounded));
}

/** `true` quando o disparo foi criado para se repetir (ausente = publicação única). */
export function isRecurring(broadcast: Pick<GroupBroadcast, 'recurrenceIntervalHours'>): boolean {
  return (
    broadcast.recurrenceIntervalHours !== undefined && broadcast.recurrenceIntervalHours !== null
  );
}

/**
 * Quando a próxima repetição deve começar: o intervalo contado a partir do fim
 * da repetição anterior, já empurrado para dentro da janela de horário.
 */
export function computeNextRunAt(
  finishedAt: Date,
  intervalHours: number,
  window?: SendWindow,
): Date {
  const target = new Date(
    finishedAt.getTime() + clampRecurrenceIntervalHours(intervalHours) * 60 * 60 * 1000,
  );
  return shiftIntoSendWindow(target, window);
}

export type RecurrenceDecision =
  | { shouldRepeat: true; nextRunAt: Date }
  | { shouldRepeat: false; reason: RecurrenceStopReason };

/**
 * Decide o destino do disparo depois de uma repetição terminar.
 *
 * As TRÊS formas de término do fundador convivem e são independentes: teto de
 * repetições, data/hora limite, e "até eu cancelar" (nenhum dos dois
 * preenchido). Quando os dois limites existem, vale o que vier primeiro — a
 * checagem é feita sobre o instante da PRÓXIMA publicação, não sobre agora: um
 * disparo cuja próxima repetição cairia depois do limite simplesmente encerra,
 * em vez de publicar uma vez a mais fora do combinado.
 *
 * Cancelar ou pausar não passa por aqui: aquilo muda o `status`, e o
 * processador nem chega a perguntar.
 */
export function decideNextRun(
  broadcast: Pick<
    GroupBroadcast,
    'recurrenceIntervalHours' | 'recurrenceMaxRuns' | 'recurrenceEndsAt' | 'runsCompleted'
  >,
  window: SendWindow | undefined,
  finishedAt: Date,
): RecurrenceDecision {
  const runsCompleted = broadcast.runsCompleted + 1;
  const maxRuns = broadcast.recurrenceMaxRuns;
  if (maxRuns !== undefined && maxRuns !== null && runsCompleted >= maxRuns) {
    return { shouldRepeat: false, reason: 'max_runs_reached' };
  }

  const nextRunAt = computeNextRunAt(
    finishedAt,
    broadcast.recurrenceIntervalHours ?? MIN_RECURRENCE_INTERVAL_HOURS,
    window,
  );

  const endsAt = broadcast.recurrenceEndsAt;
  if (endsAt && nextRunAt.getTime() > endsAt.getTime()) {
    return { shouldRepeat: false, reason: 'end_date_reached' };
  }

  return { shouldRepeat: true, nextRunAt };
}
