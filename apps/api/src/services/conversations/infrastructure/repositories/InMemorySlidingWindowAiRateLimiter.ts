import { AiRateLimiter } from '../../domain/repositories/AiRateLimiter';

interface WindowConfig {
  /** Quantas tentativas são permitidas dentro da janela. */
  limit: number;
  /** Tamanho da janela deslizante, em milissegundos. */
  windowMs: number;
}

/** Ponto de partida conservador para o beta — ver docstring da classe. */
export const DEFAULT_CONVERSATION_WINDOW: WindowConfig = { limit: 6, windowMs: 60_000 };
export const DEFAULT_SESSION_WINDOW: WindowConfig = { limit: 30, windowMs: 60_000 };

/**
 * Implementação em memória (janela deslizante por timestamps) de
 * `AiRateLimiter` — Fase 1, Bloco F1.10.
 *
 * ESCOLHA DOS VALORES (documentada, não arbitrária):
 * - **Por conversa: 6 mensagens/60s.** Uma pessoa digitando rápido em
 *   pedaços ("oi", "tudo bem?", "queria saber sobre X") normalmente manda
 *   2-4 mensagens em sequência — 6 dá folga real para isso sem soar
 *   artificial. Acima disso, no período de 1 minuto, o padrão deixa de ser
 *   "conversa humana normal" e passa a ser rajada (bot, mensagem em loop,
 *   teste malicioso).
 * - **Por sessão (todas as conversas daquele WhatsApp somadas): 30/60s.**
 *   Precisa ser bem maior que o limite por conversa (uma sessão real tem
 *   várias conversas simultâneas legítimas), mas ainda finito — protege
 *   contra uma rajada distribuída por muitos contatos ao mesmo tempo
 *   (ex.: número exposto publicamente recebendo spam em massa).
 *
 * Os dois valores são passados no construtor (não hardcoded no corpo do
 * método) — o mesmo padrão de `DEFAULT_HISTORY_LIMIT`/`DEFAULT_*` já usado
 * em `AiReplyJobProcessor`: são um PONTO DE PARTIDA para o beta, calibrável
 * com uso real, não uma constante de negócio definitiva.
 *
 * LIMITAÇÃO CONHECIDA (mesmo espírito de `KeyedMutex`): em memória, válida
 * só dentro deste processo. `MessageIngestionService` roda no MESMO
 * processo que hospeda as sessões WhatsApp (`apps/api/src/index.ts` —
 * `SessionManager`/Baileys), que hoje é sempre uma única instância (não há
 * múltiplas réplicas de sessão WhatsApp simultâneas para o mesmo tenant —
 * seria uma sessão duplicada, cenário já proibido pela unicidade de
 * `WhatsAppSession`). Não há, portanto, janela de risco adicional por ora;
 * revisar se o modelo de deploy mudar.
 *
 * RECUPERAÇÃO: a janela é deslizante — assim que as tentativas antigas
 * saem da janela de 60s, a PRÓXIMA mensagem inbound volta a ser permitida
 * normalmente, sem nenhuma ação manual. Não é um bloqueio permanente.
 */
export class InMemorySlidingWindowAiRateLimiter implements AiRateLimiter {
  private readonly conversationHits = new Map<string, number[]>();
  private readonly sessionHits = new Map<string, number[]>();

  constructor(
    private readonly conversationConfig: WindowConfig = DEFAULT_CONVERSATION_WINDOW,
    private readonly sessionConfig: WindowConfig = DEFAULT_SESSION_WINDOW,
    private readonly now: () => number = Date.now,
  ) {}

  consume(tenantId: string, sessionName: string, conversationId: string): boolean {
    const now = this.now();
    const conversationAllowed = this.tryConsume(
      this.conversationHits,
      `${tenantId}:${conversationId}`,
      this.conversationConfig,
      now,
    );
    const sessionAllowed = this.tryConsume(
      this.sessionHits,
      `${tenantId}:${sessionName}`,
      this.sessionConfig,
      now,
    );
    return conversationAllowed && sessionAllowed;
  }

  private tryConsume(
    store: Map<string, number[]>,
    key: string,
    config: WindowConfig,
    now: number,
  ): boolean {
    const cutoff = now - config.windowMs;
    const hits = (store.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (hits.length >= config.limit) {
      // Ainda grava a lista podada (remove entradas expiradas) para não
      // acumular memória indefinidamente numa chave que só estourou uma vez.
      store.set(key, hits);
      return false;
    }
    hits.push(now);
    store.set(key, hits);
    return true;
  }
}
