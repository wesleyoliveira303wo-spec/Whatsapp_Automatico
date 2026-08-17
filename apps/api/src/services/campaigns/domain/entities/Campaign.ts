/** Espelha `CampaignStatus` do Prisma. Só `DRAFT` é produzido por este bloco (L3) — ver docstring do model. */
export type CampaignStatus =
  'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

/**
 * Uma campanha de disparo em lote — Fase L, Bloco L3.
 *
 * Interface de dados simples (sem métodos), mesmo estilo de `Contact`/
 * `Conversation`. `ritmo`/`sendWindow` existem no schema desde já (decisão de
 * projeto registrada em `FASE_L_MOTOR_DE_LEADS.md` §10.3) mas não têm efeito
 * nenhum nesta rodada — nenhum motor de envio os lê ainda.
 */
export interface Campaign {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  messageTemplate: string;
  status: CampaignStatus;
  scheduledFor?: Date;
  intervalSeconds: number;
  dailyLimit: number;
  sendWindowStart?: string;
  sendWindowEnd?: string;
  pausedReason?: string;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Espelha `CampaignRecipientStatus` do Prisma. Só `PENDING`/`SKIPPED` são produzidos por este bloco (L3). */
export type CampaignRecipientStatus = 'pending' | 'sent' | 'failed' | 'skipped' | 'replied';

/**
 * Os três motivos de supressão automática deste bloco (`determineSkipReason`).
 * `skipReason` no banco é texto livre — esta união é só a garantia, do lado
 * do Domain, de que só emitimos motivos conhecidos.
 */
export type CampaignSkipReason = 'opt_out' | 'active_human_conversation' | 'recently_contacted';

/** Um destinatário materializado de uma campanha — onde mora "63 de 100, eis os motivos". */
export interface CampaignRecipient {
  id: string;
  tenantId: string;
  campaignId: string;
  contactId: string;
  status: CampaignRecipientStatus;
  skipReason?: string;
  errorMessage?: string;
  sentAt?: Date;
  repliedAt?: Date;
  conversationId?: string;
  /** Fase L, Bloco L4 — quando o envio foi TENTADO (sucesso ou falha). Alimenta o disjuntor de segurança. */
  attemptedAt?: Date;
  createdAt: Date;
}

/** Resumo de uma materialização — o "63 de 100, eis os motivos" pedido pelo fundador. */
export interface CampaignRecipientSummary {
  total: number;
  pending: number;
  skipped: number;
  /** Contagem por motivo, só para os que existem (nunca zeros implícitos). */
  skipReasons: Partial<Record<CampaignSkipReason, number>>;
}
