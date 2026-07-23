import { WhatsAppDisconnectReason } from '../../../../src/services/whatsapp/domain/entities/WhatsAppDisconnectReason';
import { ReconnectionPolicy } from '../../../../src/services/whatsapp/domain/providers/ReconnectionPolicy';

/**
 * Fake de `ReconnectionPolicy` (Production Hardening, Bloco 8b) — registra
 * as chamadas recebidas em vez de agendar timers de verdade. Permite testar
 * `BaileysProvider` (ex.: "chama scheduleReconnect com o motivo certo",
 * "chama reset() ao conectar") sem depender de `setTimeout`/fake timers —
 * essa é a responsabilidade que `WhatsAppReconnectionPolicy.test.ts` já
 * cobre isoladamente, com a matemática real de backoff/circuit breaker.
 *
 * `fireLastRetry()` simula o timer disparando: invoca sincronamente o
 * `onRetry` da ÚLTIMA chamada de `scheduleReconnect`, sem esperar nenhum
 * tempo — útil para testes que precisam provar "quando a política decide
 * tentar de novo, o provider realmente reconecta".
 */
export class FakeReconnectionPolicy implements ReconnectionPolicy {
  public scheduleCalls: { reason: WhatsAppDisconnectReason; onRetry: () => void }[] = [];
  public resetCallCount = 0;
  public cancelPendingCallCount = 0;

  scheduleReconnect(reason: WhatsAppDisconnectReason, onRetry: () => void): void {
    this.scheduleCalls.push({ reason, onRetry });
  }

  reset(): void {
    this.resetCallCount += 1;
  }

  cancelPending(): void {
    this.cancelPendingCallCount += 1;
  }

  fireLastRetry(): void {
    const last = this.scheduleCalls[this.scheduleCalls.length - 1];
    if (!last) {
      throw new Error('FakeReconnectionPolicy.fireLastRetry(): nenhuma chamada de scheduleReconnect registrada.');
    }
    last.onRetry();
  }
}
