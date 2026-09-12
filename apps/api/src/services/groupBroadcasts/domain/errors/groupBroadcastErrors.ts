import { GroupBroadcastStatus } from '../entities/GroupBroadcast';

/**
 * Erros de Domain do bounded context `groupBroadcasts` (Disparos em grupos,
 * 2026-09-11). Reunidos num arquivo só — diferente de `campaigns`, que tem um
 * arquivo por erro — porque são pequenos, só fazem sentido juntos e são todos
 * mapeados por um único `groupBroadcastsErrorHandler`. Cada um continua sendo
 * uma CLASSE própria (mapeamento por `instanceof`, nunca por texto), mesma
 * disciplina do resto do projeto.
 */

export class GroupBroadcastNotFoundError extends Error {
  constructor(broadcastId: string) {
    super(`Disparo em grupos não encontrado: ${broadcastId}`);
    this.name = 'GroupBroadcastNotFoundError';
  }
}

export type GroupBroadcastAction =
  'start' | 'pause' | 'cancel' | 'delete' | 'attach_media';

export class InvalidGroupBroadcastTransitionError extends Error {
  constructor(
    public readonly currentStatus: GroupBroadcastStatus,
    public readonly attemptedAction: GroupBroadcastAction,
  ) {
    super(`Não é possível "${attemptedAction}" um disparo em grupos com status "${currentStatus}".`);
    this.name = 'InvalidGroupBroadcastTransitionError';
  }
}

export class NoGroupsSelectedError extends Error {
  constructor() {
    super('Selecione pelo menos um grupo.');
    this.name = 'NoGroupsSelectedError';
  }
}

export class TooManyGroupsSelectedError extends Error {
  constructor(
    public readonly selected: number,
    public readonly max: number,
  ) {
    super(`No máximo ${max} grupos por disparo (foram selecionados ${selected}).`);
    this.name = 'TooManyGroupsSelectedError';
  }
}

/**
 * Não foi possível consultar os grupos da sessão agora — WhatsApp desconectado
 * (`not_connected`) ou sem resposta dentro do teto (`timeout`). Criar um
 * disparo sem essa conferência seria confiar no que o cliente diz sobre cada
 * grupo; por isso a criação falha em vez de adivinhar.
 */
export class GroupDirectoryUnavailableError extends Error {
  constructor(public readonly reason: 'not_connected' | 'timeout') {
    super(
      reason === 'not_connected'
        ? 'O WhatsApp desta sessão não está conectado — conecte para ver os grupos.'
        : 'O WhatsApp não respondeu à consulta de grupos a tempo. Tente de novo em instantes.',
    );
    this.name = 'GroupDirectoryUnavailableError';
  }
}

/**
 * Já existe outro disparo em grupos EM ANDAMENTO nesta sessão. Um de cada vez
 * por número: dois disparos em paralelo dobrariam o ritmo de publicação — o
 * padrão que o WhatsApp mais associa a spam.
 */
export class GroupBroadcastAlreadyRunningError extends Error {
  constructor(public readonly sessionName: string) {
    super(
      'Já existe um disparo em grupos em andamento neste WhatsApp. Aguarde terminar ou pause-o antes de iniciar outro.',
    );
    this.name = 'GroupBroadcastAlreadyRunningError';
  }
}

/** Mesma trava de plano do disparo de campanha (`planPermiteUso`): criar é livre, DISPARAR é recurso pago. */
export class GroupBroadcastRequiresPaidPlanError extends Error {
  constructor() {
    super('Disparar em grupos é um recurso do Plano Pro. Fale com o comercial para ativar seu plano.');
    this.name = 'GroupBroadcastRequiresPaidPlanError';
  }
}

/** Modo degradado (sem `REDIS_URL`): leitura/criação funcionam, o motor de envio não existe. */
export class GroupBroadcastEngineNotConfiguredError extends Error {
  constructor() {
    super('O motor de envio de disparos em grupos não está configurado neste ambiente.');
    this.name = 'GroupBroadcastEngineNotConfiguredError';
  }
}

export class GroupBroadcastMediaTooLargeError extends Error {
  constructor(
    public readonly receivedBytes: number,
    public readonly maxBytes: number,
  ) {
    super(`Mídia enviada (${receivedBytes} bytes) excede o teto permitido (${maxBytes} bytes).`);
    this.name = 'GroupBroadcastMediaTooLargeError';
  }
}

export class GroupBroadcastMediaTypeMismatchError extends Error {
  constructor(
    public readonly declaredCategory: string,
    public readonly detectedCategory: string,
  ) {
    super(
      `O arquivo parece ser "${detectedCategory}", mas foi enviado como "${declaredCategory}".`,
    );
    this.name = 'GroupBroadcastMediaTypeMismatchError';
  }
}

export class GroupBroadcastMediaNotFoundError extends Error {
  constructor(broadcastId: string) {
    super(`Este disparo em grupos não tem mídia anexada: ${broadcastId}`);
    this.name = 'GroupBroadcastMediaNotFoundError';
  }
}

/**
 * Configuração de recorrência incoerente (2026-09-11) — número de repetições
 * fora da faixa, data de término no passado, ou janela de horário incompleta.
 * Vira 400: é erro de quem pediu, não do sistema.
 */
export class InvalidRecurrenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRecurrenceError';
  }
}
