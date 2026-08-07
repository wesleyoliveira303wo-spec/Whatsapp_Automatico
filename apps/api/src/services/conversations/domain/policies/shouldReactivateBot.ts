import { Conversation } from '../entities/Conversation';

/**
 * Janela padrão de silêncio (em ms) antes de o bot reassumir uma conversa que
 * foi escalada para atendimento humano mas ninguém assumiu — 30 minutos
 * (decisão do usuário, 2026-07-23). É uma janela de cortesia para o time
 * humano agir: só depois desse tempo de silêncio o bot volta a responder, na
 * próxima mensagem do cliente. Constante local, overridável pelo parâmetro de
 * `shouldReactivateBot`/pelo construtor de `MessageIngestionService` — mesmo
 * padrão de `DEFAULT_HISTORY_LIMIT`/`DEFAULT_MAX_TOKENS`.
 */
export const DEFAULT_BOT_REACTIVATION_SILENCE_MS = 30 * 60 * 1000;

/**
 * Uma conversa está "aguardando humano sem dono" quando foi escalada
 * (`status === 'human'`) mas nenhum atendente a assumiu (`assignedToUserId`
 * ausente). É exatamente o estado em que a auto-escalação da IA (N2) e o
 * escalonamento-em-falha deixam a conversa — a fila de espera. Uma conversa
 * que um humano DE FATO assumiu (`assignedToUserId` preenchido) NÃO se
 * encaixa: o bot nunca reassume o que uma pessoa está atendendo.
 */
export function isWaitingForHumanUnowned(conversation: Conversation): boolean {
  return conversation.status === 'human' && !conversation.assignedToUserId;
}

/**
 * Decide se o bot deve REASSUMIR uma conversa que está aguardando humano sem
 * dono — Milestone N2 (evolução): "se a conversa ficar em silêncio e ninguém
 * disser mais nada, devolva ao bot para responder futuras dúvidas" (pedido do
 * usuário, 2026-07-23).
 *
 * Função pura de Domain (mesmo padrão de `shouldAutoRespond`), sem efeito
 * colateral: quem persiste a mudança de status é a Application
 * (`MessageIngestionService`). Duas condições:
 *   1. A conversa está aguardando humano sem dono (`isWaitingForHumanUnowned`)
 *      — se um humano assumiu, o bot nunca interfere.
 *   2. O silêncio (intervalo entre `now` e a última atividade da conversa)
 *      atingiu o limite. `lastActivityAt` é o `occurredAt` da mensagem mais
 *      recente ANTES da que está chegando (a última coisa dita na conversa —
 *      pode ser o próprio aviso de "encaminhando para atendente"). Medir pelo
 *      gap entre mensagens é o sentido literal de "ficou em silêncio", e não
 *      depende de `Conversation.updatedAt` (que o upsert bumpa a cada mensagem
 *      recebida, logo não serve como marca do escalonamento).
 *
 * `now >= lastActivityAt + threshold` (>=, não >): na fronteira exata do
 * limite já reassume — escolha deliberada, sem impacto prático (resolução de
 * ms), documentada só para o teste ser determinístico.
 */
export function shouldReactivateBot(
  conversation: Conversation,
  now: Date,
  lastActivityAt: Date,
  silenceThresholdMs: number = DEFAULT_BOT_REACTIVATION_SILENCE_MS,
): boolean {
  if (!isWaitingForHumanUnowned(conversation)) {
    return false;
  }
  return now.getTime() - lastActivityAt.getTime() >= silenceThresholdMs;
}
