import { WhatsAppDisconnectReason } from '../entities/WhatsAppDisconnectReason';

/**
 * Porta (port) para a política de reconexão automática (Production
 * Hardening, Bloco 8b). Encapsula backoff exponencial + circuit breaker por
 * trás de três operações mínimas — quem consome esta porta (`BaileysProvider`)
 * nunca lida com `setTimeout`/contadores diretamente; essa é exatamente a
 * responsabilidade que este port isola (SRP: "decidir/agendar reconexões" é
 * uma única razão para mudar, separada de "falar o protocolo Baileys").
 *
 * Cada instância de `WhatsAppProvider` (uma sessão) deve ter sua PRÓPRIA
 * instância de `ReconnectionPolicy` — o estado (falhas consecutivas, circuito
 * aberto/fechado) é por sessão, nunca compartilhado entre tenants/sessões
 * (ver `BaileysProviderFactory.create()`, que cria uma nova instância a cada
 * `WhatsAppProvider` criado).
 */
export interface ReconnectionPolicy {
  /**
   * Decide, a partir do `WhatsAppDisconnectReason` já classificado, se
   * agenda uma nova tentativa de reconexão. Se permitida e o circuito ainda
   * estiver fechado, agenda `onRetry` para rodar após o delay calculado
   * (backoff exponencial) e incrementa o contador de falhas consecutivas.
   * Não faz nada (e loga o motivo) quando: o `reason` é definitivo (ver
   * `isDisconnectReasonRecoverable`), ou o circuito já está aberto.
   */
  scheduleReconnect(reason: WhatsAppDisconnectReason, onRetry: () => void): void;

  /**
   * Reinicia o estado por completo (zera falhas consecutivas, fecha o
   * circuito) — chamado após uma conexão bem-sucedida (`connection === 'open'`).
   */
  reset(): void;

  /**
   * Cancela uma reconexão agendada e ainda não disparada, se houver — usado
   * quando uma desconexão explícita (`disconnect()`) ou uma nova tentativa de
   * conexão (`connect()`) torna a reconexão pendente redundante ou
   * indesejada.
   */
  cancelPending(): void;
}
