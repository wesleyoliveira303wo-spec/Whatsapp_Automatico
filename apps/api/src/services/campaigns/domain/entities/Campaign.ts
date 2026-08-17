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

/** Espelha `Conversation['stage']` (`services/conversations/domain`) — literal duplicado de propósito para não importar um tipo inline de outro bounded context só por um union de 5 valores. */
export type CampaignLinkedConversationStage =
  'new' | 'contacted' | 'negotiating' | 'closed_won' | 'closed_lost';

/**
 * Métricas de campanha — Fase L, Bloco L7 (`FASE_L_MOTOR_DE_LEADS.md` §13).
 * O funil real além de "mensagens enviadas": elegibilidade, entrega TENTADA
 * (o produto não tem confirmação de entrega do WhatsApp — nunca inventa essa
 * métrica), resposta, e o que acontece depois via Pipeline/IA.
 *
 * Campos `?` (opcionais) representam uma métrica sem denominador válido
 * (ex.: `responseRate` sem nenhuma tentativa de envio ainda) — devolvidos
 * como `undefined`, NUNCA como `0` disfarçado, para a UI distinguir "ainda
 * não há dado" de "a taxa é zero de verdade".
 */
export interface CampaignMetrics {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  replied: number;
  skipped: number;
  skipReasons: Partial<Record<CampaignSkipReason, number>>;
  /** `replied / (sent + failed + replied)` — só entre quem teve o envio TENTADO. */
  responseRate?: number;
  /** Média de `repliedAt - sentAt` em minutos, só entre destinatários `REPLIED` com ambos os timestamps. */
  avgTimeToFirstReplyMinutes?: number;
  /** Contagem por `stage`, entre as conversas vinculadas a esta campanha (`CampaignRecipient.conversationId`). Sempre as 5 chaves, mesmo com 0. */
  stageCounts: Record<CampaignLinkedConversationStage, number>;
  /** Quantas conversas vinculadas têm `escalatedAt` preenchido (já pediram ajuda humana em algum momento). */
  escalatedCount: number;
  /** `closed_won / total de conversas vinculadas` — undefined se não há nenhuma conversa vinculada ainda. */
  conversionRate?: number;
  /** Soma de `AiInteraction.costUsd` de todas as conversas vinculadas a esta campanha. */
  aiCostUsd: number;
  /** `aiCostUsd / closed_won` — undefined se ainda não há nenhuma conversão. */
  costPerConversionUsd?: number;
  /** Quantas vezes a IA escalou por `unknown_answer` (F1.4) nas conversas desta campanha — "a IA travou N vezes". */
  unknownAnswerCount: number;
}
