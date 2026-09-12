import { computeSendDelayMs } from '../../../campaigns/domain/policies/computeSendDelayMs';
import {
  CampaignSendOutcome,
  CircuitBreakerOptions,
  shouldTripCircuitBreaker,
} from '../../../campaigns/domain/policies/shouldTripCircuitBreaker';
import { GroupBroadcastMediaContentType, GroupBroadcastSkipReason } from '../entities/GroupBroadcast';
import { GroupDirectoryEntry } from '../providers/GroupDirectory';

/**
 * Calibragem ANTI-BANIMENTO do disparo em grupos (2026-09-11).
 *
 * A LÓGICA é a mesma do motor 1:1 (Fase L, L4) e por isso é REAPROVEITADA —
 * `computeSendDelayMs` e `shouldTripCircuitBreaker` são funções puras de
 * Domain, importadas daqui do mesmo jeito que `CampaignService` já importa
 * `mediaMagicBytes` de `conversations`. O que muda é só a CALIBRAGEM: publicar
 * a mesma mensagem em vários grupos é o padrão que o WhatsApp mais associa a
 * spam (`PRODUCT_BACKLOG.md` §3), então tudo aqui é mais conservador que o 1:1.
 */

/** Espaçamento-base padrão entre um grupo e o seguinte (o 1:1 usa 75s para CONVERSAS; aqui é por grupo, cada um com muitos membros). */
export const DEFAULT_GROUP_INTERVAL_SECONDS = 60;

/** Piso absoluto — nunca abaixo disto, mesmo que o cliente HTTP peça. */
export const MIN_GROUP_INTERVAL_SECONDS = 30;

/** Teto — acima disto um disparo de 30 grupos passaria de 5 horas sem ganho real de segurança. */
export const MAX_GROUP_INTERVAL_SECONDS = 600;

/** Variação aleatória somada a cada envio: sem cadência rígida detectável. */
export const GROUP_JITTER_MAX_MS = 30_000;

/** Quantos grupos um único disparo pode atingir. */
export const MAX_GROUPS_PER_BROADCAST = 30;

/**
 * Tetos de tamanho do anexo por tipo. Imagem segue o teto de campanha
 * (`MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES`, 5MB); vídeo sobe para 16MB — o mesmo
 * teto do envio de mídia pelo operador (F1.3) — porque um vídeo curto de
 * divulgação passa fácil de 5MB. O binário é relido a cada grupo, mas o
 * disparo tem no máximo `MAX_GROUPS_PER_BROADCAST` alvos, então o custo fica
 * limitado.
 */
export const MAX_GROUP_MEDIA_BYTES: Record<GroupBroadcastMediaContentType, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
};

/** Maior dos tetos acima — é o limite do corpo HTTP bruto da rota de upload. */
export const MAX_GROUP_MEDIA_UPLOAD_BYTES = Math.max(...Object.values(MAX_GROUP_MEDIA_BYTES));

/**
 * Disjuntor MAIS SENSÍVEL que o do 1:1 (lá: 5 tentativas, >40% de falha).
 * Aqui: basta as DUAS últimas tentativas falharem — "ao primeiro sinal de
 * falhas seguidas". Com amostra de 2, `>50%` só é verdadeiro com 2 de 2
 * falhas; uma falha isolada seguida de um sucesso não pausa.
 */
export const GROUP_CIRCUIT_BREAKER_SAMPLE_SIZE = 2;
export const GROUP_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  minSampleSize: GROUP_CIRCUIT_BREAKER_SAMPLE_SIZE,
  maxFailureRate: 0.5,
};

/** Normaliza o intervalo pedido: ausente/inválido vira o padrão; fora da faixa é trazido para dentro dela. */
export function clampGroupIntervalSeconds(requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return DEFAULT_GROUP_INTERVAL_SECONDS;
  }
  const rounded = Math.round(requested);
  return Math.min(MAX_GROUP_INTERVAL_SECONDS, Math.max(MIN_GROUP_INTERVAL_SECONDS, rounded));
}

/**
 * Delay do n-ésimo grupo (base 0) de um lote sendo agendado agora:
 * `n × intervalo + jitter`. O intervalo passa por `clampGroupIntervalSeconds`
 * de novo aqui — defesa em profundidade: mesmo um valor gravado fora da faixa
 * (edição manual no banco) nunca vira um disparo acelerado.
 */
export function computeGroupSendDelayMs(
  index: number,
  intervalSeconds: number,
  now: Date,
  randomFn?: () => number,
): number {
  return computeSendDelayMs(index, {
    intervalBaseMs: clampGroupIntervalSeconds(intervalSeconds) * 1000,
    jitterMaxMs: GROUP_JITTER_MAX_MS,
    now,
    randomFn,
  });
}

/** `true` quando o disparo deve PAUSAR sozinho — ver `GROUP_CIRCUIT_BREAKER_OPTIONS`. */
export function shouldPauseGroupBroadcast(recentOutcomes: CampaignSendOutcome[]): boolean {
  return shouldTripCircuitBreaker(recentOutcomes, GROUP_CIRCUIT_BREAKER_OPTIONS);
}

/**
 * Decide se um grupo pedido entra (`undefined`) ou nasce suprimido — a partir
 * da listagem AO VIVO (o servidor nunca confia no cliente sobre o grupo):
 *
 * - não está na lista → `group_not_found` (o número saiu do grupo, ou o id é
 *   inválido);
 * - está, mas só admins enviam e o número não é admin → `admin_only_group`
 *   (tentar enviar só geraria uma falha e contaria contra o disjuntor).
 */
export function determineGroupTargetSkipReason(
  entry: GroupDirectoryEntry | undefined,
): GroupBroadcastSkipReason | undefined {
  if (!entry) return 'group_not_found';
  if (!entry.canSend) return 'admin_only_group';
  return undefined;
}
