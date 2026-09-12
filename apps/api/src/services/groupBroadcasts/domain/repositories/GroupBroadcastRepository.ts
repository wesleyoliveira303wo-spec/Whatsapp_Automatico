import {
  GroupBroadcast,
  GroupBroadcastMediaContentType,
  GroupBroadcastStatus,
  GroupBroadcastSummary,
  GroupBroadcastTarget,
} from '../entities/GroupBroadcast';

export interface CreateGroupBroadcastData {
  tenantId: string;
  sessionName: string;
  name: string;
  messageTemplate: string;
  intervalSeconds: number;
  createdByUserId?: string;
  /** Recorrência (2026-09-11) — todos opcionais; ausentes = publicação única. */
  recurrenceIntervalHours?: number;
  recurrenceMaxRuns?: number;
  recurrenceEndsAt?: Date;
  sendWindowStart?: string;
  sendWindowEnd?: string;
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
 */
export interface GroupBroadcastRepository {
  create(data: CreateGroupBroadcastData): Promise<GroupBroadcast>;
  createTargets(
    tenantId: string,
    broadcastId: string,
    drafts: GroupBroadcastTargetDraft[],
  ): Promise<void>;

  findById(tenantId: string, broadcastId: string): Promise<GroupBroadcast | undefined>;
  /** Mais recentes primeiro, teto `limit` (a tela lista os de UMA sessão; volume baixo por natureza). */
  listBySession(tenantId: string, sessionName: string, limit: number): Promise<GroupBroadcast[]>;

  listTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastTarget[]>;
  findTargetById(tenantId: string, targetId: string): Promise<GroupBroadcastTarget | undefined>;
  /** Pendentes em ordem de criação — a ordem de agendamento. */
  listPendingTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastTarget[]>;
  summarizeTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastSummary>;
  /** Uma consulta para vários disparos (lista da tela), nunca uma por linha. */
  summarizeTargetsForBroadcasts(
    tenantId: string,
    broadcastIds: string[],
  ): Promise<Map<string, GroupBroadcastSummary>>;

  /** Só age sobre alvo ainda `pending` (idempotência: um job repetido nunca reescreve o resultado). */
  markTargetSent(tenantId: string, targetId: string, attemptedAt: Date): Promise<void>;
  markTargetFailed(
    tenantId: string,
    targetId: string,
    attemptedAt: Date,
    errorMessage: string,
  ): Promise<void>;
  /** Últimas `limit` tentativas (mais recente primeiro) — alimenta o disjuntor. */
  listRecentOutcomes(
    tenantId: string,
    broadcastId: string,
    limit: number,
  ): Promise<Array<'sent' | 'failed'>>;
  countPending(tenantId: string, broadcastId: string): Promise<number>;

  /**
   * Prepara a próxima repetição: todo alvo `sent`/`failed` volta a `pending`
   * (limpando erro/tentativa). `skipped` NUNCA é reaberto — grupo que só
   * admins publicam, ou do qual o número saiu, continua fora até o disparo ser
   * recriado. Devolve quantos alvos ficaram pendentes.
   */
  resetTargetsForNextRun(tenantId: string, broadcastId: string): Promise<number>;

  /**
   * Fecha uma repetição: grava `runsCompleted` e quando a próxima começa
   * (`null` quando não há próxima). Nunca mexe em `status` — quem decide
   * entre continuar e encerrar é o processador.
   */
  markRunFinished(
    tenantId: string,
    broadcastId: string,
    runsCompleted: number,
    nextRunAt: Date | null,
  ): Promise<void>;

  updateStatus(
    tenantId: string,
    broadcastId: string,
    status: GroupBroadcastStatus,
    pausedReason?: string,
  ): Promise<GroupBroadcast | undefined>;
  /**
   * Quantos disparos desta sessão estão `running` (opcionalmente ignorando um
   * id). Não é mais usado para travar `startBroadcast` (2026-09-12: o
   * fundador pediu explicitamente que mais de um disparo rode em paralelo na
   * mesma sessão) — mantido como leitura de apoio (histórico/painel), não
   * como regra de negócio.
   */
  countRunningBySession(
    tenantId: string,
    sessionName: string,
    excludeBroadcastId?: string,
  ): Promise<number>;
  deleteById(tenantId: string, broadcastId: string): Promise<boolean>;

  attachMedia(
    tenantId: string,
    broadcastId: string,
    media: GroupBroadcastMediaContent,
  ): Promise<GroupBroadcast | undefined>;
  removeMedia(tenantId: string, broadcastId: string): Promise<GroupBroadcast | undefined>;
  /** Único caminho que lê o BINÁRIO (download/preview e envio). */
  getMediaContent(
    tenantId: string,
    broadcastId: string,
  ): Promise<GroupBroadcastMediaContent | undefined>;
}
