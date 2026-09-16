/**
 * Reconciliação de edição de uma campanha para contatos (2026-09-15) — mesmo
 * racional/estrutura de `reconcileBroadcastEdit.ts` (disparo em grupos):
 * função PURA, recebe o estado ATUAL (`existing`) e o DESEJADO pelo operador
 * (`desiredContactIds`/`desiredPhones`, já normalizados e deduplicados pelo
 * chamador) e devolve só a diferença. Quem aplica é `CampaignService.updateCampaign`.
 *
 * Regra central: destinatário com HISTÓRICO nunca é apagado — vira "suprimido"
 * (`toSuppress`), preservando `sentAt`/`repliedAt`/`conversationId` para as
 * métricas continuarem corretas. Sem histórico, some de vez (`toDelete`).
 */

/**
 * Um destinatário já materializado — SEMPRE um dos dois campos (nunca os
 * dois, nunca nenhum), mesmo invariante de `CampaignRecipient`.
 */
export interface ExistingRecipient {
  id: string;
  contactId?: string;
  phoneE164?: string;
  /** `status` é `SENT`, `FAILED` ou `REPLIED` — já teve o envio tentado ao menos uma vez. */
  hasHistory: boolean;
}

export interface RecipientReconciliation {
  toCreateContactIds: string[];
  toCreatePhones: string[];
  toDelete: string[];
  toSuppress: string[];
}

/**
 * `desiredContactIds`/`desiredPhones` representam o estado final desejado por
 * inteiro (não "só quem mudou") — mesma arquitetura da edição de disparo em
 * grupos. Um existente cujo identificador (contactId OU phoneE164, conforme o
 * que ele tem) não aparece mais no desejado é removido; um identificador
 * desejado que não bate com nenhum existente é novo.
 */
export function reconcileRecipients(
  existing: ExistingRecipient[],
  desiredContactIds: string[],
  desiredPhones: string[],
): RecipientReconciliation {
  const desiredContactSet = new Set(desiredContactIds);
  const desiredPhoneSet = new Set(desiredPhones);

  const existingContactIds = new Set(
    existing.filter((r) => r.contactId !== undefined).map((r) => r.contactId!),
  );
  const existingPhones = new Set(
    existing.filter((r) => r.contactId === undefined && r.phoneE164 !== undefined).map((r) => r.phoneE164!),
  );

  const toCreateContactIds = Array.from(new Set(desiredContactIds)).filter(
    (id) => !existingContactIds.has(id),
  );
  const toCreatePhones = Array.from(new Set(desiredPhones)).filter(
    (phone) => !existingPhones.has(phone),
  );

  const toDelete: string[] = [];
  const toSuppress: string[] = [];
  for (const recipient of existing) {
    const stillDesired =
      recipient.contactId !== undefined
        ? desiredContactSet.has(recipient.contactId)
        : recipient.phoneE164 !== undefined
          ? desiredPhoneSet.has(recipient.phoneE164)
          : true; // Nunca deveria acontecer (invariante) — nunca remove por engano.
    if (stillDesired) continue;
    if (recipient.hasHistory) {
      toSuppress.push(recipient.id);
    } else {
      toDelete.push(recipient.id);
    }
  }

  return { toCreateContactIds, toCreatePhones, toDelete, toSuppress };
}
