import type { GroupBroadcastStep, GroupBroadcastStepTarget } from './clientApi';

/**
 * Painel de detalhe de um disparo em grupos (2026-09-18) — a "Status"/
 * "Detalhe" congelados de `GroupBroadcastTarget` (a elegibilidade decidida na
 * criação) nunca mudam para `sent`/`failed`. Quem descreve o que de fato
 * aconteceu em cada publicação é `GroupBroadcastStepTarget`, um por
 * (etapa, grupo) — é o que estas funções puras preparam para a tela.
 */

/**
 * Quando esta publicação saiu pela última vez, em QUALQUER grupo — o
 * `sentAt` mais recente entre os alvos desta etapa. `undefined` se a etapa
 * nunca publicou (nenhum alvo com `sentAt`).
 */
export function lastSentAtForStep(
  targets: readonly GroupBroadcastStepTarget[] | undefined,
): string | undefined {
  if (!targets) return undefined;
  let latest: { iso: string; ms: number } | undefined;
  for (const target of targets) {
    if (!target.sentAt) continue;
    const ms = new Date(target.sentAt).getTime();
    if (!latest || ms > latest.ms) latest = { iso: target.sentAt, ms };
  }
  return latest?.iso;
}

/** Uma linha da lista de grupos — o alvo real, mais a publicação a que ele pertence. */
export interface GroupBroadcastDisplayRow {
  /** Único mesmo com o mesmo grupo aparecendo em várias publicações. */
  key: string;
  stepId: string;
  /** 1-based — o que a tela já usa em "Publicação N de M". */
  stepNumber: number;
  target: GroupBroadcastStepTarget;
}

/**
 * Achata os alvos de TODAS as etapas numa lista só, na ordem das
 * publicações — uma campanha de publicação única vira, na prática, a mesma
 * lista de sempre; uma com várias publicações mostra o mesmo grupo uma vez
 * por publicação, cada uma com seu próprio status/hora (o grupo pode já ter
 * recebido a 1ª publicação três vezes e a 2ª nenhuma).
 */
export function flattenStepTargetsForDisplay(
  steps: readonly GroupBroadcastStep[],
  stepTargets: Record<string, readonly GroupBroadcastStepTarget[] | undefined>,
): GroupBroadcastDisplayRow[] {
  const rows: GroupBroadcastDisplayRow[] = [];
  steps.forEach((step, index) => {
    const targets = stepTargets[step.id] ?? [];
    for (const target of targets) {
      rows.push({ key: `${step.id}:${target.id}`, stepId: step.id, stepNumber: index + 1, target });
    }
  });
  return rows;
}
