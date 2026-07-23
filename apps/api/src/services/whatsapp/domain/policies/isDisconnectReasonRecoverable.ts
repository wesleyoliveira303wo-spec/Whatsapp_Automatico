import { WhatsAppDisconnectReason } from '../entities/WhatsAppDisconnectReason';

/**
 * Classifica se uma reconexão automática é permitida para o motivo de
 * desconexão dado (Production Hardening, Bloco 8b — "utilizar apenas
 * disconnectReason para decidir se uma reconexão é permitida ou
 * definitiva").
 *
 * Função pura, sem estado, sem timers: só responde "é seguro tentar de
 * novo?". QUANDO tentar (backoff, circuit breaker) é responsabilidade de
 * `ReconnectionPolicy`/`WhatsAppReconnectionPolicy` — nunca desta função.
 * Separar as duas perguntas ("é permitido?" vs "quando, com que
 * espaçamento, até quando desistir?") mantém cada uma testável de forma
 * isolada e evita que a política de backoff precise conhecer regras de
 * negócio sobre motivos de desconexão.
 *
 * Único motivo NÃO recuperável: `'logged_out'` — o usuário desvinculou o
 * dispositivo pelo celular; as credenciais já foram invalidadas e limpas
 * (Bloco 8a, BUG-13). Reconectar automaticamente aqui não teria efeito (o
 * WhatsApp rejeitaria de novo) e mascararia a real necessidade de um QR
 * Code novo — a sessão precisa ficar `'disconnected'` até uma nova chamada
 * explícita de `init()`.
 *
 * Todos os demais motivos (`restart_required`, `connection_lost`,
 * `timed_out`, `unknown`) são recuperáveis — mesma orientação já
 * documentada antes deste bloco (ver `BaileysProvider`, BUG-14): "reconectar
 * em qualquer close que não seja loggedOut". Este bloco só generaliza essa
 * regra (antes hard-coded só para `restartRequired`) para todos os motivos
 * recuperáveis, agora sob backoff/circuit breaker em vez de reconexão
 * imediata e ilimitada.
 */
export function isDisconnectReasonRecoverable(reason: WhatsAppDisconnectReason): boolean {
  return reason !== 'logged_out';
}
