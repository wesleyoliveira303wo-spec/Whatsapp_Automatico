import { RateLimitStore } from '../../../../shared/domain/RateLimitStore';
import { AiRateLimiter } from '../../domain/repositories/AiRateLimiter';

interface WindowConfig {
  /** Quantas tentativas são permitidas dentro da janela. */
  limit: number;
  /** Tamanho da janela deslizante, em milissegundos. */
  windowMs: number;
}

/** Ponto de partida conservador — ver docstring da classe. */
export const DEFAULT_CONVERSATION_WINDOW: WindowConfig = { limit: 6, windowMs: 60_000 };
export const DEFAULT_SESSION_WINDOW: WindowConfig = { limit: 30, windowMs: 60_000 };

/**
 * `AiRateLimiter` apoiado num `RateLimitStore` compartilhado (bloco B1).
 *
 * Substitui a implementação anterior, que mantinha os próprios `Map`s em
 * memória: a contagem agora vive no Redis, então o limite vale para o
 * sistema inteiro e sobrevive a um restart do processo. Sem Redis
 * configurado, o store injetado é o de memória — o comportamento volta a ser
 * exatamente o de antes, sem quebrar o modo degradado (D8).
 *
 * ESCOLHA DOS VALORES (mantida da versão anterior, documentada e não
 * arbitrária):
 * - **Por conversa: 6 chamadas de IA/60s.** Desde 2026-09-17 a unidade é a
 *   CHAMADA, não a mensagem recebida — uma rajada de fragmentos vira uma
 *   chamada só (ver `AiRateLimiter`). Seis respostas para a mesma pessoa em
 *   um minuto já é bem acima do ritmo de uma conversa humana; acima disso o
 *   padrão é automação dos dois lados ou mensagem em loop.
 * - **Por sessão (todas as conversas daquele WhatsApp somadas): 30/60s.**
 *   Precisa ser bem maior que o limite por conversa (uma sessão real tem
 *   várias conversas simultâneas legítimas), mas ainda finito — protege
 *   contra uma rajada distribuída por muitos contatos ao mesmo tempo (ex.:
 *   número exposto publicamente recebendo spam em massa).
 *
 * Os dois valores são passados no construtor: são um PONTO DE PARTIDA,
 * calibrável com uso real, não uma constante de negócio definitiva. Eles NÃO
 * foram mexidos quando a unidade mudou de mensagem para chamada (2026-09-17)
 * — mudar semântica e número na mesma rodada tornaria qualquer medição
 * seguinte ambígua. Recalibrar é uma decisão separada, agora sobre números
 * que dizem o que medem.
 *
 * RECUPERAÇÃO: a janela é deslizante — assim que as tentativas antigas saem
 * dela, a PRÓXIMA mensagem inbound volta a ser permitida normalmente, sem
 * nenhuma ação manual. Não é um bloqueio permanente.
 *
 * Os dois limites são consultados SEMPRE (nunca em curto-circuito): mesmo
 * quando a conversa já estourou, a tentativa precisa ser contabilizada
 * também no balde da sessão, senão uma conversa saturada esconderia do
 * limite de sessão todo o tráfego que ela mesma gera.
 */
export class RateLimitStoreAiRateLimiter implements AiRateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly conversationConfig: WindowConfig = DEFAULT_CONVERSATION_WINDOW,
    private readonly sessionConfig: WindowConfig = DEFAULT_SESSION_WINDOW,
  ) {}

  async consume(
    tenantId: string,
    sessionName: string,
    conversationId: string,
  ): Promise<boolean> {
    const [conversation, session] = await Promise.all([
      this.store.hit(
        `ai:conversation:${tenantId}:${conversationId}`,
        this.conversationConfig.windowMs,
        this.conversationConfig.limit,
      ),
      this.store.hit(
        `ai:session:${tenantId}:${sessionName}`,
        this.sessionConfig.windowMs,
        this.sessionConfig.limit,
      ),
    ]);

    return conversation.allowed && session.allowed;
  }
}
