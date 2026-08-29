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
/** Categorias de mídia suportadas para o anexo de uma campanha — mesmo vocabulário de `MediaSender`/`MessageContentType`, exceto `text`/`sticker` (não aplicáveis a um disparo em massa). */
export type CampaignMediaContentType = 'image' | 'audio' | 'video' | 'document';

export interface Campaign {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  /** Texto livre opcional (reorganização Contatos/Campanhas, 2026-08-17) — só para o operador se orientar, nunca lido por regra nenhuma. */
  description?: string;
  messageTemplate: string;
  status: CampaignStatus;
  scheduledFor?: Date;
  intervalSeconds: number;
  dailyLimit: number;
  sendWindowStart?: string;
  sendWindowEnd?: string;
  pausedReason?: string;
  createdByUserId?: string;
  /**
   * Fase L, Bloco L8 (2026-08-20) — metadados do anexo, quando a campanha tem
   * um (`undefined` = sem mídia, mensagem só de texto). DELIBERADAMENTE sem o
   * binário aqui: esta entidade é o que `findById`/`listByTenant` devolvem em
   * toda resposta JSON de lista/detalhe — o BINÁRIO só é lido sob demanda via
   * `CampaignRepository.getMediaContent` (rota de download dedicada).
   */
  media?: {
    contentType: CampaignMediaContentType;
    mimeType: string;
    fileName?: string;
  };
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

/**
 * Um destinatário materializado de uma campanha — onde mora "63 de 100, eis
 * os motivos".
 *
 * Reorganização Contatos/Campanhas (2026-08-17): `contactId` é opcional —
 * um destinatário vindo de planilha/lista manual sem Contato correspondente
 * nasce só com `phoneE164`/`name` (nunca força a criação de um Contato).
 * Sempre um dos dois está presente, nunca nenhum (garantido por
 * `CampaignService.createCampaign` + `CHECK` no banco).
 */
export interface CampaignRecipient {
  id: string;
  tenantId: string;
  campaignId: string;
  contactId?: string;
  /** Só presente quando `contactId` é ausente — o telefone (já normalizado) de quem não tem Contato salvo. */
  phoneE164?: string;
  /** Nome opcional trazido pela planilha/lista manual — só existe junto de `phoneE164`. */
  name?: string;
  /**
   * Fase de Prospecção IA (2026-08-29) — quando presente, o envio real
   * (`CampaignSendJobProcessor`) usa ESTE texto em vez de
   * `Campaign.messageTemplate` para este destinatário. `undefined` =
   * comportamento de sempre (usa o template da campanha).
   */
  personalizedMessage?: string;
  /**
   * Padronização de exibição de contato (2026-08-20) — quando `contactId` é
   * definido, o Contato salvo resolvido EM LOTE por `listRecipients` (nunca
   * linha a linha, nunca nos demais métodos deste repositório — só a leitura
   * usada para exibir a lista precisa disso). `undefined` para um destinatário
   * "solto" (`phoneE164`/`name` acima), OU quando o resultado não veio de
   * `listRecipients`.
   *
   * `name` só existe quando o operador salvou um nome para esse Contato;
   * `nickname` é o apelido do WhatsApp (`WhatsAppConversation.contactName`) da
   * conversa vinculada a este destinatário, quando houver — mesmo par de
   * dados usado em Conversas/Pipeline/Contatos, aqui resolvido para a mesma
   * regra de exibição ("nome salvo sozinho; senão telefone + apelido").
   */
  contact?: {
    name?: string;
    phoneE164: string;
    nickname?: string;
  };
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

/**
 * Visão geral de campanhas de UMA sessão — retrofit visual 2026-08-18
 * (réplica de imagem do fundador), tela "Campanhas". Cards do topo +
 * donut "Status das campanhas" do painel lateral.
 *
 * `trends` (variação vs. mês anterior) só existe quando o mês anterior tem
 * uma base > 0 para comparar — `undefined` nunca vira "0%" disfarçado (mesma
 * disciplina de `CampaignMetrics`/`responseRate`).
 */
export interface CampaignSessionOverview {
  totalCampaigns: number;
  statusCounts: Record<CampaignStatus, number>;
  totalSent: number;
  totalReplied: number;
  responseRate?: number;
  trends: {
    /** Campanhas criadas este mês vs. mês anterior. */
    campaignsDeltaPct?: number;
    /** Mensagens enviadas este mês vs. mês anterior (por `sentAt`). */
    messagesSentDeltaPct?: number;
    /** Respostas recebidas este mês vs. mês anterior (por `repliedAt`). */
    repliesDeltaPct?: number;
    /** Taxa de resposta deste mês vs. mês anterior. */
    responseRateDeltaPct?: number;
  };
}
