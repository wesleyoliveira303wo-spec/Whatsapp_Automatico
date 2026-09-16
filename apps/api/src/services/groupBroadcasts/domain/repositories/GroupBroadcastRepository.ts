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

  // --- Edição de disparo já criado (2026-09-15) -----------------------------
  // Salvar uma edição NUNCA agenda nada na fila — só reconcilia o estado
  // desejado com o persistido. Quem agenda continua sendo start/retomar.

  /**
   * Atualiza o "envelope" da campanha (nome, ritmo, janela, escalonamento) —
   * SUBSTITUI por completo, mesma semântica de `create`: campo ausente vira
   * `null` (nunca "deixa como estava"), porque o cliente sempre envia o
   * estado final desejado inteiro.
   */
  updateBroadcastSettings(
    tenantId: string,
    broadcastId: string,
    data: {
      name: string;
      intervalSeconds: number;
      sendWindowStart?: string;
      sendWindowEnd?: string;
      stepLaunchOffsetMinutes?: number;
    },
  ): Promise<GroupBroadcast | undefined>;

  /**
   * Atualiza o CONTEÚDO de uma etapa já existente (texto/recorrência) — nunca
   * mexe em `order` (nunca reatribuída) nem em `runsCompleted`/`nextRunAt`/
   * `startedAt`/`finishedAt` (histórico de execução, intocado pela edição).
   */
  updateStep(
    tenantId: string,
    stepId: string,
    data: {
      messageTemplate: string;
      recurrenceIntervalHours?: number;
      recurrenceMaxRuns?: number;
      recurrenceEndsAt?: Date;
    },
  ): Promise<GroupBroadcastStep | undefined>;

  /**
   * Apaga etapas SEM HISTÓRICO (nunca chamado para uma etapa que já publicou
   * — essa é encerrada via `markStepFinished`, nunca apagada). Array vazio
   * devolve 0 sem tocar o banco.
   */
  deleteSteps(tenantId: string, stepIds: string[]): Promise<number>;
  /**
   * Apaga alvos (grupos) SEM HISTÓRICO — remoção de verdade, o grupo nunca
   * recebeu nenhuma publicação. Array vazio devolve 0 sem tocar o banco.
   */
  deleteTargets(tenantId: string, targetIds: string[]): Promise<number>;
  /**
   * Remove um grupo COM HISTÓRICO da edição sem apagar nada: marca o
   * `GroupBroadcastTarget` **e** todo `GroupBroadcastStepTarget` daquele alvo
   * como `SKIPPED`, numa única transação — as duas escritas precisam
   * acontecer juntas, senão a próxima repetição republica no grupo removido
   * (`resetStepTargetsForNextRun` nunca reabre `skipped`, então é isso que
   * torna a supressão permanente). `sentCount` é preservado — o relatório que
   * o operador manda ao cliente continua verdadeiro. Array vazio devolve 0
   * sem tocar o banco.
   */
  suppressTargets(tenantId: string, targetIds: string[], skipReason: string): Promise<number>;
  /**
   * Reabre um grupo que tinha sido suprimido NUMA EDIÇÃO ANTERIOR
   * (`skipReason: 'removed_by_operator'`) e que o operador re-selecionou
   * agora — o oposto simétrico de `suppressTargets`: volta `GroupBroadcastTarget`
   * **e** todo `GroupBroadcastStepTarget` daquele alvo para `pending`, limpando
   * `skipReason`, numa única transação. Só o SERVIÇO decide chamar isto, e só
   * depois de reconferir o grupo AO VIVO (2026-09-16) — reabrir sem essa
   * checagem devolveria à fila um grupo que virou "só admins" ou de onde o
   * número saiu nesse meio-tempo. `sentCount` é preservado (não é zerado —
   * é histórico de publicações passadas, não do ciclo atual). Array vazio
   * devolve 0 sem tocar o banco.
   */
  reopenTargets(tenantId: string, targetIds: string[]): Promise<number>;
  /**
   * Soma de `sentCount` por `targetId`, através de TODAS as etapas da
   * campanha — é o `hasHistory` que a reconciliação de edição consome
   * (`sentCount > 0` nalguma etapa = já publicou, nunca pode ser apagado).
   * Agregação no banco (`groupBy` + `_sum`), nunca carregando linha a linha.
   */
  countStepTargetsWithHistory(tenantId: string, broadcastId: string): Promise<Map<string, number>>;
}
