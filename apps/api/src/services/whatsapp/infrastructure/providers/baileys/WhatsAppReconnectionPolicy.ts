import { Logger } from '../../../../../shared/domain/Logger';
import { WhatsAppDisconnectReason } from '../../../domain/entities/WhatsAppDisconnectReason';
import { ReconnectionPolicy } from '../../../domain/providers/ReconnectionPolicy';
import { isDisconnectReasonRecoverable } from '../../../domain/policies/isDisconnectReasonRecoverable';

/**
 * Parâmetros do backoff exponencial + circuit breaker (Production
 * Hardening, Bloco 8b) — centralizados aqui, nunca espalhados como números
 * mágicos pelo código que consome esta política.
 *
 * `delay(n) = min(baseDelayMs * factor^(n-1), maxDelayMs)`, onde `n` é o
 * número da tentativa (1ª falha consecutiva = `n=1`, `delay = baseDelayMs`).
 * Depois de `maxConsecutiveFailures` falhas consecutivas, o circuito abre e
 * nenhuma nova tentativa é agendada até `reset()` (conexão bem-sucedida).
 */
export interface ReconnectionPolicyConfig {
  baseDelayMs: number;
  factor: number;
  maxDelayMs: number;
  maxConsecutiveFailures: number;
}

/**
 * Valores-padrão — escolhidos para produção (retentativas espaçadas o
 * suficiente para não martelar o servidor do WhatsApp, mas sem deixar uma
 * sessão instável presa por minutos sem tentar de novo): 1s, 2s, 4s, 8s, 16s
 * (teto em 30s), desistindo após 5 falhas consecutivas. Testes injetam sua
 * própria config (delays menores) — nunca dependem destes valores.
 */
export const DEFAULT_RECONNECTION_POLICY_CONFIG: ReconnectionPolicyConfig = {
  baseDelayMs: 1000,
  factor: 2,
  maxDelayMs: 30000,
  maxConsecutiveFailures: 5,
};

/**
 * Implementação concreta de `ReconnectionPolicy` (Production Hardening,
 * Bloco 8b): backoff exponencial + circuit breaker, com estado PRIVADO a
 * esta instância (falhas consecutivas, circuito aberto/fechado, timer
 * pendente) — nunca exposto, nunca compartilhado entre sessões (ver
 * docstring do port `ReconnectionPolicy`).
 *
 * Por que uma classe concreta (Infrastructure), não pura/Domain: possui
 * efeito colateral real (`setTimeout`/`clearTimeout`), o que a torna uma
 * preocupação técnica, não uma regra de negócio — a REGRA de negócio
 * ("este motivo permite retry?") já está isolada em
 * `isDisconnectReasonRecoverable` (Domain, função pura), reaproveitada aqui
 * sem duplicação.
 *
 * Nunca chama `connect()`/conhece `BaileysProvider`, `WASocket` ou qualquer
 * detalhe do protocolo — só recebe um `onRetry: () => void` genérico e o
 * invoca depois do delay. Isso mantém esta classe reutilizável por
 * qualquer futuro segundo provider (`WhatsAppProvider`), sem acoplamento ao
 * Baileys especificamente — mora em `infrastructure/providers/baileys/`
 * hoje só porque é o único consumidor real (YAGNI); mover para um local
 * mais compartilhado só quando um segundo provider existir de fato (mesmo
 * racional já usado para `shared/tenant`).
 */
export class WhatsAppReconnectionPolicy implements ReconnectionPolicy {
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private pendingTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly config: ReconnectionPolicyConfig,
    private readonly logger: Logger,
  ) {}

  scheduleReconnect(reason: WhatsAppDisconnectReason, onRetry: () => void): void {
    if (!isDisconnectReasonRecoverable(reason)) {
      this.logger.debug('Reconexão automática não agendada: motivo definitivo', { reason });
      return;
    }

    if (this.circuitOpen) {
      this.logger.debug('Reconexão automática não agendada: circuito de reconexão está aberto', {
        reason,
        consecutiveFailures: this.consecutiveFailures,
      });
      return;
    }

    this.consecutiveFailures += 1;

    if (this.consecutiveFailures > this.config.maxConsecutiveFailures) {
      this.circuitOpen = true;
      this.logger.warn('Circuito de reconexão aberto: desistindo após falhas consecutivas', {
        reason,
        consecutiveFailures: this.consecutiveFailures,
        maxConsecutiveFailures: this.config.maxConsecutiveFailures,
      });
      return;
    }

    const delayMs = this.computeDelayMs();
    this.logger.info('Reconexão automática agendada com backoff exponencial', {
      reason,
      attempt: this.consecutiveFailures,
      delayMs,
    });

    // Defensivo: garante que nunca há dois timers pendentes simultâneos
    // desta mesma instância (ex.: dois eventos 'close' muito próximos).
    this.cancelPending();
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = undefined;
      onRetry();
    }, delayMs);
  }

  reset(): void {
    this.cancelPending();
    if (this.consecutiveFailures > 0 || this.circuitOpen) {
      this.logger.debug('Circuito de reconexão resetado após conexão bem-sucedida', {
        previousConsecutiveFailures: this.consecutiveFailures,
        wasOpen: this.circuitOpen,
      });
    }
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
  }

  cancelPending(): void {
    if (this.pendingTimer !== undefined) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = undefined;
    }
  }

  private computeDelayMs(): number {
    const exponential =
      this.config.baseDelayMs * this.config.factor ** (this.consecutiveFailures - 1);
    return Math.min(exponential, this.config.maxDelayMs);
  }
}
