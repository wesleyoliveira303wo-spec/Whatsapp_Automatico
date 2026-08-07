/**
 * Funções puras de horário de atendimento — F1.8 (2026-08-01).
 *
 * Sem dependências externas: usa só `Intl.DateTimeFormat` (nativo do Node),
 * sem biblioteca de timezone. Testável com injeção de `now` (5º parâmetro).
 *
 * `WorkingHoursConfig` é a parte relevante do `AiBusinessProfile` para esta
 * lógica — o código que chama estas funções não precisa do perfil inteiro,
 * só dos campos de horário. TypeScript resolve a compatibilidade estrutural
 * automaticamente (qualquer `AiBusinessProfile` é um `WorkingHoursConfig`).
 */

export interface WorkingHoursConfig {
  offHoursEnabled: boolean;
  /** Mensagem customizada exibida fora do horário; `null` usa o padrão. */
  offHoursMessage: string | null;
  /** Início do expediente, formato "HH:MM" (ex.: "09:00"). `null` = não configurado. */
  workingHoursStart: string | null;
  /** Fim do expediente, formato "HH:MM" (ex.: "18:00"). `null` = não configurado. */
  workingHoursEnd: string | null;
  /**
   * Bitmask dos dias de atendimento: bit 0 = Domingo, bit 1 = Segunda … bit 6 = Sábado.
   * Valor padrão 62 = 0b0111110 = Segunda–Sexta.
   */
  workingDays: number;
  /** Nome de timezone IANA (ex.: "America/Sao_Paulo"). */
  timezone: string;
}

/** Seg–Sex (bits 1–5 ligados). */
export const DEFAULT_WORKING_DAYS = 62;
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

const DEFAULT_OFF_HOURS_MESSAGE =
  'Estamos fora do horário de atendimento no momento. Nossa equipe responderá em breve durante o horário comercial!';

/** Converte "HH:MM" em minutos desde meia-noite. */
function parseMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Retorna o dia da semana (0=Dom … 6=Sáb) e o minuto do dia (0–1439) no
 * `timezone` especificado para `now`. Usa `Intl.DateTimeFormat.formatToParts`
 * para não depender de biblioteca de timezone.
 */
function getLocalParts(timezone: string, now: Date): { dayOfWeek: number; minuteOfDay: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  dtf.formatToParts(now).forEach(({ type, value }) => {
    parts[type] = value;
  });

  const DOW_MAP: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // `hour12: false` pode devolver "24" em alguns engines — normaliza com módulo.
  const rawHour = parseInt(parts['hour'] ?? '0', 10) % 24;
  const minute = parseInt(parts['minute'] ?? '0', 10);

  return {
    dayOfWeek: DOW_MAP[parts['weekday'] ?? 'Mon'] ?? 1,
    minuteOfDay: rawHour * 60 + minute,
  };
}

/**
 * Retorna `true` se o instante `now` está dentro do horário de atendimento
 * configurado. Devolve sempre `true` quando:
 * - `offHoursEnabled` é `false` (feature desligada — nunca "fora do horário")
 * - `workingHoursStart`/`workingHoursEnd` não estão configurados
 */
export function isWithinWorkingHours(config: WorkingHoursConfig, now = new Date()): boolean {
  if (!config.offHoursEnabled) return true;
  if (!config.workingHoursStart || !config.workingHoursEnd) return true;

  let dayOfWeek: number;
  let minuteOfDay: number;
  try {
    ({ dayOfWeek, minuteOfDay } = getLocalParts(config.timezone, now));
  } catch {
    // Timezone inválido → degradação graciosa: assume "dentro do horário" para não silenciar a IA.
    return true;
  }

  // Verifica se o dia da semana está no bitmask
  if ((config.workingDays & (1 << dayOfWeek)) === 0) return false;

  const start = parseMinutes(config.workingHoursStart);
  const end = parseMinutes(config.workingHoursEnd);

  return minuteOfDay >= start && minuteOfDay < end;
}

/**
 * Retorna o bloco de texto a injetar no system prompt quando o cliente envia
 * uma mensagem fora do horário de atendimento, ou `undefined` se estiver
 * dentro do horário (ou com a feature desligada). O texto é formatado para
 * instrução da IA — não é enviado diretamente ao cliente; o `PromptBuilder`
 * o anexa ao system prompt para que a IA o use ao formular a resposta.
 */
export function getOffHoursContext(
  config: WorkingHoursConfig,
  now = new Date(),
): string | undefined {
  if (isWithinWorkingHours(config, now)) return undefined;
  const message = config.offHoursMessage?.trim() || DEFAULT_OFF_HOURS_MESSAGE;
  return (
    `# Aviso de Horário de Atendimento\n` +
    `O cliente entrou em contato fora do horário de atendimento configurado.\n` +
    `Use a mensagem abaixo para informar o cliente, adaptando o tom conforme necessário:\n` +
    `"${message}"\n` +
    `Continue respondendo dúvidas simples que você sabe responder — nunca deixe o cliente sem nenhuma resposta.`
  );
}
