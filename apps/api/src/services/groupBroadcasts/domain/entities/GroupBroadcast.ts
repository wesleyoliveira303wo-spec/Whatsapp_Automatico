/**
 * Espelha `CampaignStatus` do Prisma (o model reaproveita o mesmo enum). Literal
 * duplicado de propósito — mesmo racional de `CampaignLinkedConversationStage`:
 * não importar um tipo de outro bounded context só por uma união de valores.
 * `scheduled` não é produzido nesta entrega (recorrência ficou para depois).
 */
export type GroupBroadcastStatus =
  'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

/**
 * Mídia aceita numa publicação de disparo em grupos: o pedido do fundador foi
 * literalmente "mensagem, imagem, vídeo". Áudio/documento ficaram de fora
 * nesta entrega (registrado em `PRODUCT_BACKLOG.md` §3).
 */
export type GroupBroadcastMediaContentType = 'image' | 'video';

/**
 * Um disparo em grupos de WhatsApp — uma SEQUÊNCIA de publicações distintas
 * (`GroupBroadcastStep`), 2026-09-14. Desde a "cadência entre publicações"
 * (mesma data), todas as etapas rodam em PARALELO — não existe mais "a etapa
 * atual"; cada uma tem seu próprio progresso (`GroupBroadcastStepTarget`) e
 * seu próprio relógio de repetição.
 *
 * `GroupBroadcast` guarda só o "envelope" da campanha: grupos-alvo (via
 * `GroupBroadcastTarget`), janela de horário, ritmo entre grupos e o
 * escalonamento inicial entre publicações. Mensagem, mídia e recorrência
 * moram em `GroupBroadcastStep`. Uma campanha do modelo antigo (uma mensagem,
 * opcionalmente repetida) é, sob este modelo, apenas uma campanha com UMA
 * etapa — nenhum conceito novo, nenhuma segunda família de entidade.
 */
export interface GroupBroadcast {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  status: GroupBroadcastStatus;
  intervalSeconds: number;
  /** Janela diária permitida ("HH:MM", fuso `America/Sao_Paulo`) — vale para a campanha inteira, atravessando etapas. */
  sendWindowStart?: string;
  sendWindowEnd?: string;
  /**
   * Minutos entre o início de uma publicação e o início da seguinte, na
   * PRIMEIRA vez que cada etapa dispara — ausente/0 = todas começam juntas.
   * Depois do lançamento inicial, cada etapa repete sozinha, independente.
   */
  stepLaunchOffsetMinutes?: number;
  pausedReason?: string;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Uma publicação da sequência (2026-09-14). `media` carrega só METADADOS — o
 * binário nunca viaja nesta entidade; só
 * `GroupBroadcastRepository.getStepMediaContent` o lê.
 */
export interface GroupBroadcastStep {
  id: string;
  tenantId: string;
  broadcastId: string;
  /** Ordem de execução (0, 1, 2...) — única dentro da campanha. */
  order: number;
  /** Texto publicado; com mídia, vira a LEGENDA (uma mensagem só, nunca duas). */
  messageTemplate: string;
  media?: {
    contentType: GroupBroadcastMediaContentType;
    mimeType: string;
    fileName?: string;
  };
  /** Recorrência DESTA etapa: de quantas em quantas horas repete. Ausente = publica uma vez, depois avança. */
  recurrenceIntervalHours?: number;
  /** Fim por contagem: avança/encerra depois de N publicações desta etapa. */
  recurrenceMaxRuns?: number;
  /** Fim por data: não inicia publicação desta etapa depois deste instante. */
  recurrenceEndsAt?: Date;
  /** Publicações desta etapa já concluídas. */
  runsCompleted: number;
  /** Quando a próxima repetição (ou o lançamento inicial) desta etapa começa; ausente se um ciclo está em andamento ou se ela já terminou de vez. */
  nextRunAt?: Date;
  /** Preenchido UMA VEZ, na 1ª vez que `startBroadcast` agenda esta etapa — distingue "nunca rodou" de "já rodou, entre ciclos". */
  startedAt?: Date;
  /** Preenchido UMA VEZ, quando a recorrência desta etapa termina para sempre (nunca mais repete). */
  finishedAt?: Date;
  createdAt: Date;
}

export type GroupBroadcastTargetStatus = 'pending' | 'sent' | 'failed' | 'skipped';

/**
 * Motivos de um grupo nascer suprimido (`skipped`) — decididos na criação por
 * `determineGroupTargetSkipReason`, a partir da listagem AO VIVO dos grupos (o
 * servidor nunca confia no que o cliente diz sobre cada grupo).
 */
export type GroupBroadcastSkipReason = 'admin_only_group' | 'group_not_found';

/**
 * Elegibilidade de UM grupo para a campanha (2026-09-14: fixa desde a criação
 * — nunca mais muda depois disso). `status` só distingue `pending`
 * (elegível) de `skipped` (não existe mais, ou só admins publicam); o
 * progresso de ENVIO de cada etapa vive em `GroupBroadcastStepTarget`, não
 * aqui — antes da "cadência entre publicações" este mesmo `status` também
 * carregava `sent`/`failed` da etapa ativa, porque só uma etapa rodava por
 * vez; com etapas em paralelo isso deixou de fazer sentido num registro só.
 */
export interface GroupBroadcastTarget {
  id: string;
  tenantId: string;
  broadcastId: string;
  groupJid: string;
  /** Retrato do nome no momento da criação. */
  groupName: string;
  status: GroupBroadcastTargetStatus;
  skipReason?: string;
  createdAt: Date;
}

/**
 * Progresso de UM grupo em UMA etapa específica (2026-09-14). Cada etapa tem
 * sua PRÓPRIA lista — a mesma pessoa pode já ter recebido a Publicação 1 três
 * vezes enquanto a Publicação 4 ainda nem saiu pela primeira.
 */
export interface GroupBroadcastStepTarget {
  id: string;
  tenantId: string;
  broadcastId: string;
  stepId: string;
  targetId: string;
  groupJid: string;
  groupName: string;
  status: GroupBroadcastTargetStatus;
  skipReason?: string;
  errorMessage?: string;
  sentAt?: Date;
  attemptedAt?: Date;
  /** Quantas vezes ESTA etapa já publicou neste grupo — cresce a cada repetição da etapa. */
  sentCount: number;
  createdAt: Date;
}

/**
 * Contagem por status — sempre as quatro chaves. Numa campanha (`GroupBroadcast`),
 * soma através de TODAS as etapas em paralelo; numa etapa (`GroupBroadcastStep`),
 * só dela. `sent`/`pending`/`failed` refletem o CICLO ATUAL de cada etapa
 * somado (o status de um `GroupBroadcastStepTarget` volta a `pending` a cada
 * repetição, via `resetStepTargetsForNextRun`). `totalSent` é a soma de
 * `sentCount`, cumulativa através de todas as repetições já concluídas.
 */
export interface GroupBroadcastSummary {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  /** Soma de `sentCount` — publicações reais, cumulativas através das repetições. */
  totalSent: number;
}
