/**
 * Motor de ritmo — Fase L, Bloco L4 (`FASE_L_MOTOR_DE_LEADS.md` §9.3).
 *
 * `delay(n) = n × intervaloBase + jitter(0..variação)`. Com um `intervaloBase`
 * de 60–90s e jitter real, uma campanha de 100 leads se espalha por ~2h —
 * "não é lentidão, é o produto": ritmo humano por construção, sem cadência
 * rígida detectável.
 */
export interface SendScheduleOptions {
  /** `Campaign.intervalSeconds * 1000` — o espaçamento-base entre um envio e o seguinte. */
  intervalBaseMs: number;
  /** Variação aleatória somada ao delay-base, em ms (0 até este teto). */
  jitterMaxMs: number;
  /** Horário permitido de disparo, formato "HH:MM" — fora dele, o envio é empurrado para a próxima janela. Ambos ausentes = sem restrição de horário. */
  sendWindowStart?: string;
  sendWindowEnd?: string;
  /** Momento em que a campanha está sendo (re)agendada — "agora". */
  now: Date;
  /** Injetável para teste determinístico — default `Math.random`. */
  randomFn?: () => number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "HH:MM" → minutos desde a meia-noite. Entrada inválida (fora do padrão) devolve `null` — tratado como "sem janela" pelo chamador. */
function parseHhMmToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Se `targetDate` cai fora de `[sendWindowStart, sendWindowEnd]` (horário
 * LOCAL do processo — mesma simplificação já documentada em
 * `AiBusinessProfile`/`workingHours.ts`, timezone por tenant fica para uma
 * extensão futura), devolve o `Date` do próximo instante dentro da janela;
 * senão devolve `targetDate` sem alteração.
 *
 * Assume `sendWindowStart < sendWindowEnd` (janela dentro do mesmo dia, nunca
 * atravessando a meia-noite) — mesma restrição documentada na UI.
 */
function pushIntoSendWindow(
  targetDate: Date,
  sendWindowStart: string,
  sendWindowEnd: string,
): Date {
  const startMinutes = parseHhMmToMinutes(sendWindowStart);
  const endMinutes = parseHhMmToMinutes(sendWindowEnd);
  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    return targetDate; // configuração inválida — não trava o envio por causa dela.
  }

  const targetMinutes = targetDate.getHours() * 60 + targetDate.getMinutes();
  if (targetMinutes >= startMinutes && targetMinutes <= endMinutes) {
    return targetDate;
  }

  const windowStartToday = new Date(targetDate);
  windowStartToday.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

  if (targetMinutes < startMinutes) {
    return windowStartToday; // ainda não abriu hoje — espera até abrir.
  }
  return new Date(windowStartToday.getTime() + DAY_MS); // já fechou hoje — só amanhã.
}

/**
 * Delay (em ms, relativo a `options.now`) do n-ésimo destinatário (`index`,
 * base 0) de um lote sendo agendado agora.
 */
export function computeSendDelayMs(index: number, options: SendScheduleOptions): number {
  const random = options.randomFn ?? Math.random;
  const jitter = Math.floor(random() * options.jitterMaxMs);
  const baseDelayMs = index * options.intervalBaseMs + jitter;

  if (!options.sendWindowStart || !options.sendWindowEnd) {
    return baseDelayMs;
  }

  const targetDate = new Date(options.now.getTime() + baseDelayMs);
  const adjustedDate = pushIntoSendWindow(
    targetDate,
    options.sendWindowStart,
    options.sendWindowEnd,
  );
  return Math.max(0, adjustedDate.getTime() - options.now.getTime());
}
