import { CampaignSkipReason } from '../entities/Campaign';

/**
 * O que se sabe sobre UM contato, no momento de materializar uma campanha —
 * já resolvido pela Infrastructure (consultas em lote), para esta função
 * permanecer pura e testável sem banco.
 */
export interface RecipientEligibility {
  /** `WhatsAppContact.optOutAt != null`. */
  optedOut: boolean;
  /** Existe uma `WhatsAppConversation` deste contato com `status=HUMAN` e `assignedToUserId` preenchido, em QUALQUER sessão do tenant. */
  hasActiveHumanConversation: boolean;
  /** Este contato já foi `SENT` por OUTRA campanha do tenant nos últimos 7 dias. */
  recentlyContactedByCampaign: boolean;
}

/**
 * Decide se um contato é suprimido da campanha e por quê — Fase L, Bloco L3.
 *
 * As três regras de supressão automática, confirmadas com o fundador antes de
 * implementar (ver `FASE_L_MOTOR_DE_LEADS.md` §11, etapa 7): opt-out sempre
 * vence primeiro (é o único motivo com peso legal/de política do WhatsApp);
 * depois conversa ativa com humano (mandar uma campanha para alguém que já
 * está sendo atendido é ruído, não oportunidade); por último, contato
 * recente por outra campanha (evita "spam" de campanhas empilhadas). A ORDEM
 * importa só para o motivo reportado quando mais de um se aplica — o
 * resultado final (suprimido ou não) é o mesmo de qualquer forma.
 *
 * `null` = elegível, vira `PENDING` na materialização.
 */
export function determineSkipReason(eligibility: RecipientEligibility): CampaignSkipReason | null {
  if (eligibility.optedOut) {
    return 'opt_out';
  }
  if (eligibility.hasActiveHumanConversation) {
    return 'active_human_conversation';
  }
  if (eligibility.recentlyContactedByCampaign) {
    return 'recently_contacted';
  }
  return null;
}
