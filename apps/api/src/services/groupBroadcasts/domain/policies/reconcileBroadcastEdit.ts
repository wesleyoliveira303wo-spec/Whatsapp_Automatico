/**
 * Reconciliação de edição de um disparo em grupos (2026-09-15).
 *
 * Funções PURAS: recebem o estado ATUAL (`existing`) e o estado DESEJADO pelo
 * operador (`desired`) e devolvem só a diferença — quem aplica a diferença é
 * a camada de Application (`GroupBroadcastService.updateBroadcast`), que
 * também é quem decide o que fazer com uma diferença aplicada (nunca chamar o
 * dispatcher — salvar uma edição não agenda nada).
 *
 * Regra central de ambas: item com HISTÓRICO nunca é apagado — vira "etapa
 * encerrada" (`toFinish`) ou "alvo suprimido" (`toSuppress`), preservando o
 * que já aconteceu (repetições publicadas, mensagens enviadas).
 */

export interface ExistingStep {
  id: string;
  order: number;
  runsCompleted: number;
  hasHistory: boolean;
}

export interface DesiredStep {
  id?: string;
  messageTemplate: string;
  recurrenceIntervalHours?: number;
  recurrenceMaxRuns?: number;
  recurrenceEndsAt?: Date;
}

export interface StepReconciliation {
  toUpdate: Array<{ id: string; desired: DesiredStep }>;
  toCreate: Array<{ order: number; desired: DesiredStep }>;
  toDelete: string[];
  toFinish: string[];
}

/**
 * `desired.id` que bate com um `existing.id` real → a etapa continua,
 * atualiza o conteúdo. `desired.id` ausente OU que não bate com nenhuma etapa
 * existente (id inválido, ou de outra campanha) → tratada como etapa NOVA —
 * a validação de propriedade é responsabilidade do serviço, que roda depois
 * desta função pura.
 */
export function reconcileSteps(existing: ExistingStep[], desired: DesiredStep[]): StepReconciliation {
  const existingById = new Map(existing.map((step) => [step.id, step]));
  const matchedIds = new Set<string>();

  const toUpdate: StepReconciliation['toUpdate'] = [];
  const toCreate: StepReconciliation['toCreate'] = [];

  let nextOrder = existing.reduce((max, step) => Math.max(max, step.order), -1) + 1;

  for (const desiredStep of desired) {
    const match = desiredStep.id !== undefined ? existingById.get(desiredStep.id) : undefined;
    if (match) {
      matchedIds.add(match.id);
      toUpdate.push({ id: match.id, desired: desiredStep });
    } else {
      toCreate.push({ order: nextOrder, desired: desiredStep });
      nextOrder += 1;
    }
  }

  const toDelete: string[] = [];
  const toFinish: string[] = [];
  for (const step of existing) {
    if (matchedIds.has(step.id)) continue;
    if (step.hasHistory) {
      toFinish.push(step.id);
    } else {
      toDelete.push(step.id);
    }
  }

  return { toUpdate, toCreate, toDelete, toFinish };
}

export interface ExistingTarget {
  id: string;
  groupJid: string;
  hasHistory: boolean;
}

export interface TargetReconciliation {
  toCreate: string[];
  toDelete: string[];
  toSuppress: string[];
}

/** Deduplica `desiredJids` preservando a ordem de chegada. */
export function reconcileTargets(existing: ExistingTarget[], desiredJids: string[]): TargetReconciliation {
  const desiredSet = new Set<string>();
  const toCreate: string[] = [];
  const existingJids = new Set(existing.map((target) => target.groupJid));

  for (const jid of desiredJids) {
    if (desiredSet.has(jid)) continue;
    desiredSet.add(jid);
    if (!existingJids.has(jid)) {
      toCreate.push(jid);
    }
  }

  const toDelete: string[] = [];
  const toSuppress: string[] = [];
  for (const target of existing) {
    if (desiredSet.has(target.groupJid)) continue;
    if (target.hasHistory) {
      toSuppress.push(target.id);
    } else {
      toDelete.push(target.id);
    }
  }

  return { toCreate, toDelete, toSuppress };
}
