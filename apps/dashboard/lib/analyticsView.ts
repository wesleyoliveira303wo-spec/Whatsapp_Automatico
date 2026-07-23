import type { AiUsagePoint, MessageFlowPoint } from './clientApi';

/**
 * Funcoes PURAS de transformacao das series de analytics para o formato dos
 * graficos (Milestone 4, Bloco M4E — D49). Sem React/DOM/recharts: testaveis
 * no projeto Jest `node` (mesmo racional de `formatters.ts`/
 * `conversationsView.ts`). A UNICA conversao `costUsd` string -> number do
 * projeto acontece AQUI, na fronteira de renderizacao (D46) — o transporte
 * inteiro (API -> BFF -> hook) preserva a string decimal exata.
 */

/** Ponto de grafico de custo/uso de IA — `costUsdNumber` so para o EIXO do recharts; a string original segue disponivel para tooltip/exibicao exata. */
export interface AiUsageChartPoint {
  date: string;
  interactions: number;
  costUsdNumber: number;
  costUsd: string;
  tokensTotal: number;
  avgLatencyMs: number;
}

export function toAiUsageChartPoints(points: AiUsagePoint[]): AiUsageChartPoint[] {
  return points.map((p) => ({
    date: p.date,
    interactions: p.interactions,
    // Fronteira de renderizacao (D46): unico lugar autorizado a converter.
    costUsdNumber: Number(p.costUsd),
    costUsd: p.costUsd,
    tokensTotal: p.tokensInput + p.tokensOutput,
    avgLatencyMs: p.avgLatencyMs,
  }));
}

/**
 * Preenche dias sem dados com zeros entre `from` e `to` (UTC, D45) — sem
 * isso, o grafico de linhas "pula" dias vazios e distorce a leitura visual.
 * Implementado como transformacao pura no cliente, NUNCA no SQL (a consulta
 * devolve so os dias com dados; gerar serie densa e preocupacao de
 * apresentacao, nao de agregacao).
 */
export function fillMissingDays<T extends { date: string }>(
  points: T[],
  from: string,
  to: string,
  zero: (date: string) => T,
): T[] {
  const byDate = new Map(points.map((p) => [p.date, p]));
  const result: T[] = [];
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return points;
  }
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    const date = new Date(t).toISOString().slice(0, 10);
    result.push(byDate.get(date) ?? zero(date));
  }
  return result;
}

/** Zero-point de fluxo de mensagens, para `fillMissingDays`. */
export function zeroMessageFlowPoint(date: string): MessageFlowPoint {
  return { date, inbound: 0, outbound: 0 };
}

/** Soma total de custo de uma serie de uso de IA — devolve STRING via soma em centavos de micro (inteiros), sem float. */
export function sumCostUsd(points: AiUsagePoint[]): string {
  // `costUsd` tem ate 8 casas decimais (Decimal(12,8)). Somamos em
  // inteiros de 10^-8 (BigInt) para nao perder precisao — nunca Number.
  const SCALE = 8;
  let total = 0n;
  for (const p of points) {
    const [intPart, fracPart = ''] = p.costUsd.split('.');
    const frac = (fracPart + '0'.repeat(SCALE)).slice(0, SCALE);
    const negative = intPart.startsWith('-');
    const abs = BigInt((negative ? intPart.slice(1) : intPart) || '0') * 10n ** BigInt(SCALE) + BigInt(frac || '0');
    total += negative ? -abs : abs;
  }
  const negative = total < 0n;
  const absTotal = negative ? -total : total;
  const intPart = absTotal / 10n ** BigInt(SCALE);
  const fracPart = (absTotal % 10n ** BigInt(SCALE)).toString().padStart(SCALE, '0');
  return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}

/** Presets de faixa de tempo da pagina de analytics (D50) — UTC, terminando hoje. */
export function presetRange(days: number, now: Date = new Date()): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from, to };
}
