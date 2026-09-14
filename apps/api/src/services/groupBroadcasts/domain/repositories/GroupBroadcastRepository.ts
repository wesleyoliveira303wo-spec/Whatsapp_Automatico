import {
  GroupBroadcast,
  GroupBroadcastMediaContentType,
  GroupBroadcastStatus,
  GroupBroadcastStep,
  GroupBroadcastStepTarget,
  GroupBroadcastSummary,
  GroupBroadcastTarget,
} from '../entities/GroupBroadcast';

export interface CreateGroupBroadcastData {
  tenantId: string;
  sessionName: string;
  name: string;
  intervalSeconds: number;
  createdByUserId?: string;
  sendWindowStart?: string;
  sendWindowEnd?: string;
  /** Escalonamento inicial (2026-09-14) — minutos entre o início de uma publicação e o da seguinte. */
  stepLaunchOffsetMinutes?: number;
}

/** Uma etapa a criar junto com o disparo — `order` é atribuída pelo chamador (posição na lista). */
export interface CreateGroupBroadcastStepData {
  order: number;
  messageTemplate: string;
  recurrenceIntervalHours?: number;
  recurrenceMaxRuns?: number;
  recurrenceEndsAt?: Date;
}

export interface GroupBroadcastTargetDraft {
  groupJid: string;
  groupName: string;
  status: 'pending' | 'skipped';
  skipReason?: string;
}

export interface GroupBroadcastMediaContent {
  contentType: GroupBroadcastMediaContentType;
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
}

/**
 * Porta de persistência do bounded context `groupBroadcasts`. TODA operação
 * recebe `tenantId` e filtra por ele (defesa contra IDOR por construção —
 * mesma disciplina de `CampaignRepository`).
 *
 * Desde 2026-09-14 ("cadência entre publicações"), as etapas rodam em
 * PARALELO — não existe mais "a etapa atual" da campanha. O progresso de
 * envio é rastreado POR ETAPA (`GroupBroadcastStepTarget`), nunca mais na
 * `GroupBroadcastTarget` campanha-wide (que agora só guarda elegibilidade,
 * fixa desde a criação).
 */
export interface GroupBroadcastRepository {
  create(data: CreateGroupBroadcastData): Promise<GroupBroadcast>;
  createTargets(
    tenantId: string,
    broadcastId: string,
    drafts: GroupBroadcastTargetDraft[],
  ): Promise<void>;

  /** Cria todas as etapas de uma vez, na ordem dada. Devolve as etapas criadas, na mesma ordem. */
  createSteps(
    tenantId: string,
    broadcastId: string,
    steps: CreateGroupBroadcastStepData[],
  ): Promise<GroupBroadcastStep[]>;
  /** Todas as etapas de uma campanha, ordenadas por `order` crescente. */
  listSteps(tenantId: string, broadcastId: string): Promise<GroupBroadcastStep[]>;
  findStepById(tenantId: string, stepId: string): Promise<GroupBroadcastStep | undefined>;

  /**
   * Materializa o progresso inicial de TODAS as etapas × TODOS os alvos
   * (elegíveis ou não — um alvo `skipped` nasce `skipped` em toda etapa, sem
   * precisar reavaliar elegibilidade por etapa). Chamado uma vez, na criação.
   */
  initializeStepTargets(tenantId: string, broadcastId: string): Promise<void>;

  findById(tenantId: string, broadcastId: string): Promise<GroupBroadcast | undefined>;
  /** Mais recentes primeiro, teto `limit` (a tela lista os de UMA sessão; volume baixo por natureza). */
  listBySession(tenantId: string, sessionName: string, limit: number): Promise<GroupBroadcast[]>;

  listTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastTarget[]>;

  /** Todos os `GroupBroadcastStepTarget` de UMA etapa, com grupo/nome já resolvidos. */
  listStepTargets(tenantId: string, stepId: string): Promise<GroupBroadcastStepTarget[]>;
  findStepTargetById(
    tenantId: string,
    stepTargetId: string,
  ): Promise<GroupBroadcastStepTarget | undefined>;
  /** Pendentes de UMA etapa, em ordem de criação — a ordem de agendamento. */
  listPendingStepTargets(tenantId: string, stepId: string): Promise<GroupBroadcastStepTarget[]>;

  /** Resumo de UMA campanha — soma através de TODAS as etapas em paralelo. */
  summarizeTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastSummary>;
  /** Uma consulta para vários disparos (lista da tela), nunca uma por linha. */
  summarizeTargetsForBroadcasts(
    tenantId: string,
    broadcastIds: string[],
  ): Promise<Map<string, GroupBroadcastSummary>>;
  /** Resumo de UMA ETAPA específica — só dela (tela de detalhe, cada publicação com o seu). */
  summarizeStepTargets(tenantId: string, stepId: string): Promise<GroupBroadcastSummary>;

  /** Só age sobre alvo ainda `pending` (idempotência: um job repetido nunca reescreve o resultado). */
  markStepTargetSent(tenantId: string, stepTargetId: string, attemptedAt: Date): Promise<void>;
  markStepTargetFailed(
    tenantId: string,
    stepTargetId: string,
    attemptedAt: Date,
    errorMessage: string,
  ): Promise<void>;
  /** Últimas `limit` tentativas (mais recente primeiro) — alimenta o disjuntor, ATRAVESSANDO etapas. */
  listRecentOutcomes(
    tenantId: string,
    broadcastId: string,
    limit: number,
  ): Promise<Array<'sent' | 'failed'>>;
  /** Pendentes de UMA etapa. */
  countPendingStepTargets(tenantId: string, stepId: string): Promise<number>;

  /**
   * Prepara a próxima repetição DE UMA ETAPA: todo `GroupBroadcastStepTarget`
   * `sent`/`failed` daquela etapa volta a `pending` (limpando erro/tentativa).
   * `skipped` NUNCA é reaberto. Devolve quantos alvos ficaram pendentes.
   */
  resetStepTargetsForNextRun(tenantId: string, stepId: string): Promise<number>;

  /**
   * Fecha uma repetição DE UMA ETAPA que ainda vai continuar (postergada por
   * janela de horário, em andamento, ou com o próximo ciclo já agendado):
   * grava `runsCompleted`/`nextRunAt`. Nunca mexe em `status` da campanha.
   */
  markStepRunFinished(
    tenantId: string,
    stepId: string,
    runsCompleted: number,
    nextRunAt: Date | null,
  ): Promise<void>;
  /**
   * Encerra a recorrência DE UMA ETAPA para sempre (publicação única já
   * feita, `recurrenceMaxRuns`/`recurrenceEndsAt` atingidos, ou nenhum grupo
   * elegível restou) — grava `finishedAt` e limpa `nextRunAt`.
   */
  markStepFinished(tenantId: string, stepId: string, runsCompleted: number): Promise<void>;
  /** Todas as etapas da campanha já têm `finishedAt`? Sinal de "a campanha inteira pode virar `completed`". */
  areAllStepsFinished(tenantId: string, broadcastId: string): Promise<boolean>;
  /** Grava `startedAt` na 1ª vez que `startBroadcast` agenda esta etapa. Idempotente (não sobrescreve se já setado). */
  markStepStarted(tenantId: string, stepId: string, startedAt: Date): Promise<void>;

  updateStatus(
    tenantId: string,
    broadcastId: string,
    status: GroupBroadcastStatus,
    pausedReason?: string,
  ): Promise<GroupBroadcast | undefined>;
  /**
   * Quantos disparos desta sessão estão `running` (opcionalmente ignorando um
   * id). Não é usado para travar `startBroadcast` (2026-09-12: o fundador
   * pediu explicitamente que mais de um disparo rode em paralelo na mesma
   * sessão) — mantido como leitura de apoio (histórico/painel).
   */
  countRunningBySession(
    tenantId: string,
    sessionName: string,
    excludeBroadcastId?: string,
  ): Promise<number>;
  deleteById(tenantId: string, broadcastId: string): Promise<boolean>;

  attachStepMedia(
    tenantId: string,
    stepId: string,
    media: GroupBroadcastMediaContent,
  ): Promise<GroupBroadcastStep | undefined>;
  removeStepMedia(tenantId: string, stepId: string): Promise<GroupBroadcastStep | undefined>;
  /** Único caminho que lê o BINÁRIO de uma etapa (download/preview e envio). */
  getStepMediaContent(
    tenantId: string,
    stepId: string,
  ): Promise<GroupBroadcastMediaContent | undefined>;
}
