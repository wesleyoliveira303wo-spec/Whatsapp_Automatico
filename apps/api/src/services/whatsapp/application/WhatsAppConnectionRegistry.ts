import { Logger } from '../../../shared/domain/Logger';
import { WhatsAppSessionRepository } from '../domain/repositories/WhatsAppSessionRepository';
import { WhatsAppSessionEventRepository } from '../domain/repositories/WhatsAppSessionEventRepository';
import { WhatsAppProviderFactory } from '../domain/providers/WhatsAppProviderFactory';
import { WhatsAppSessionKey } from '../domain/valueObjects/WhatsAppSessionKey';
import { MessageReceivedHandler } from '../domain/handlers/MessageReceivedHandler';
import { SessionManager } from './SessionManager';

/**
 * Reaproveita uma única instância de `SessionManager` (e do `WhatsAppProvider`
 * correspondente) por par lógico `(tenantId, sessionName)`, ao longo de toda a
 * vida do processo (Item 5, Bloco 5). Sem isto, cada requisição HTTP (Bloco 7)
 * criaria um `SessionManager`/`WhatsAppProvider` novo — perdendo qualquer
 * conexão em andamento a cada chamada.
 *
 * Identidade única via `WhatsAppSessionKey` (mesma fonte de verdade do Bloco
 * 3, ver DECISIONS.md ADR #29): `getOrCreate()` constrói UMA única instância
 * de `WhatsAppSessionKey` por chamada e é dela — nunca dos parâmetros
 * recebidos diretamente — que tanto o `SessionManager` quanto o
 * `WhatsAppProviderFactory.create(...)` derivam seus dados. Isso fecha a
 * possibilidade de duplicação/divergência entre a identidade que o
 * `SessionManager` guarda e a que o `provider` foi construído para
 * representar.
 *
 * IMPORTANTE — a assinatura de `WhatsAppProviderFactory.create()` (porta
 * fixada no Bloco 2, ver `WhatsAppProviderFactory.ts`) recebe `tenantId`/
 * `sessionName` como *strings primitivas*, não a instância de
 * `WhatsAppSessionKey`. Isso significa que o `provider` nunca recebe o VO em
 * si (impossível dado o contrato já aprovado da porta) — recebe os valores
 * DERIVADOS de uma única `sessionKey`, lidos antes de qualquer outra coisa
 * tocar essa instância. Não há duas fontes de verdade: há uma só, e o
 * `provider` só enxerga uma projeção dela. `SessionManager`, por outro lado,
 * recebe a instância de `WhatsAppSessionKey` em si (ver seu construtor).
 *
 * Ausência de race na criação: `getOrCreate()` é inteiramente SÍNCRONO (sem
 * `async`/`await` em nenhum ponto do método) — a leitura do `Map`, a decisão
 * de criar ou não, a criação do `provider`/`SessionManager` e a escrita no
 * `Map` acontecem todas na mesma volta do laço de eventos, sem nenhum ponto
 * de suspensão no meio. A garantia de single-thread do event loop do Node
 * torna estruturalmente impossível duas chamadas concorrentes intercalarem
 * entre si dentro deste método — logo, é estruturalmente impossível criar
 * duas instâncias de `SessionManager` (ou chamar `providerFactory.create()`
 * mais de uma vez) para a MESMA chave, mesmo sob chamadas "concorrentes"
 * (ex.: disparadas de dentro do mesmo microtask, via `Promise.all`).
 *
 * Escopo deste bloco: apenas a criação/reaproveitamento de instâncias. Este
 * Registry NÃO conhece HTTP, Express, Prisma nem qualquer detalhe de
 * Presentation/Infrastructure — depende só de portas do Domain
 * (`WhatsAppProviderFactory`, `WhatsAppSessionRepository`, `Logger`) e da
 * própria Application (`SessionManager`). Composição real com a
 * implementação Baileys/Prisma fica para o composition root (Bloco 8);
 * rotas REST que consomem este Registry ficam para o Bloco 7 — nenhum dos
 * dois é tratado aqui.
 */
export class WhatsAppConnectionRegistry {
  private readonly sessionManagers = new Map<string, SessionManager>();

  constructor(
    private readonly providerFactory: WhatsAppProviderFactory,
    private readonly repo: WhatsAppSessionRepository,
    private readonly logger: Logger,
    // M2, Fase 2 (M2-B4) — repassado direto ao `SessionManager` em
    // `getOrCreate()`; o Registry em si nunca lê/escreve histórico, só
    // encaminha a dependência (mesmo papel que já tinha para `repo`/
    // `logger`: pooling puro, sem lógica de negócio própria).
    private readonly eventRepository: WhatsAppSessionEventRepository,
    // Milestone 3, Bloco 5 (D5 do levantamento arquitetural) — EXCEÇÃO
    // FORMAL, documentada, à ADR #45 ("a assinatura de
    // `createWhatsAppSessionsRegistry()` continua INALTERADA"): esta é uma
    // extensão estritamente ADITIVA (parâmetro opcional, no fim da lista),
    // não uma quebra do contrato que a ADR #45 protegia — todo código
    // existente que constrói este Registry sem o 6º argumento continua
    // compilando e se comportando exatamente como antes. Repassado direto ao
    // `SessionManager` em `getOrCreate()`, mesmo papel de mero encaminhamento
    // já documentado acima para `eventRepository`: o Registry continua sendo
    // pool puro, nunca decide o que o handler faz com uma mensagem recebida.
    private readonly messageReceivedHandler?: MessageReceivedHandler,
  ) {}

  /**
   * Devolve o `SessionManager` responsável pelo par `(tenantId, sessionName)`
   * informado — cria-o (e o `provider` correspondente) na primeira chamada
   * para esse par; em qualquer chamada seguinte, devolve a MESMA instância já
   * criada, sem chamar `providerFactory.create()` de novo.
   */
  getOrCreate(tenantId: string, sessionName: string): SessionManager {
    const sessionKey = new WhatsAppSessionKey(tenantId, sessionName);
    const cacheKey = sessionKey.toString();

    const existing = this.sessionManagers.get(cacheKey);
    if (existing) {
      return existing;
    }

    const provider = this.providerFactory.create(sessionKey.tenantId, sessionKey.sessionName);
    const sessionManager = new SessionManager(
      provider,
      sessionKey,
      this.repo,
      this.logger,
      this.eventRepository,
      this.messageReceivedHandler,
    );
    this.sessionManagers.set(cacheKey, sessionManager);
    return sessionManager;
  }

  /**
   * Devolve o `SessionManager` já existente para `(tenantId, sessionName)`
   * SEM criar um novo — `undefined` se esta sessão nunca foi tocada nesta
   * execução do processo (nenhum `getOrCreate()` prévio).
   *
   * Existe para `listSessions()` (Reforma do status ao vivo, 2026-07-25):
   * listar todas as sessões de um tenant precisa saber, para CADA UMA, se já
   * existe uma conexão viva neste processo — mas sem instanciar um
   * `SessionManager`/`WhatsAppProvider`/socket Baileys novo só para
   * descobrir isso (`getOrCreate()` faria exatamente isso, o mesmo efeito
   * colateral indesejado que a docstring de `WhatsAppSessionService.
   * listSessions()` já evitava desde a M2). `peek()` é uma leitura pura do
   * Map, nunca cria — mesma categoria de responsabilidade de `getOrCreate()`/
   * `evictIfCurrent()`, mas sem side effect nenhum.
   */
  peek(tenantId: string, sessionName: string): SessionManager | undefined {
    const cacheKey = new WhatsAppSessionKey(tenantId, sessionName).toString();
    return this.sessionManagers.get(cacheKey);
  }

  /**
   * Remove do Map o `SessionManager` de `(tenantId, sessionName)`, mas SÓ SE
   * a geração atual dele ainda for `expectedGeneration` (Production
   * Hardening, Bloco 4 — ver docstring de `SessionManager.generation`).
   *
   * Por que não basta `disconnect()` seguido de remoção incondicional: entre
   * o `disconnect()` de um chamador terminar e a evicção rodar, outra
   * chamada concorrente (via HTTP ou via reconexão automática interna do
   * Baileys após 515) pode ter reconectado a MESMA instância — removê-la do
   * Map nesse caso orfanaria uma conexão viva (a próxima `getOrCreate()`
   * criaria uma instância nova, e a antiga, já reconectada, ficaria invisível
   * ao Registry para sempre). Comparar a geração antes de remover fecha essa
   * race de verdade: tanto o incremento de geração (dentro do
   * `lifecycleLock`/callback do `SessionManager`) quanto esta comparação são
   * inteiramente síncronos — a garantia de single-thread do event loop do
   * Node torna impossível as duas seções críticas se intercalarem.
   *
   * Continua sendo pooling puro, não uma decisão de negócio: este método
   * nunca chama `disconnect()`/`init()`, nunca sabe por que a geração mudou
   * (HTTP, Baileys, ou qualquer outra coisa) — só compara dois números e
   * decide se remove uma entrada do Map, exatamente a mesma categoria de
   * responsabilidade de `getOrCreate()`.
   *
   * Retorna `true` se evictou, `false` se não encontrou a entrada ou se a
   * geração já havia avançado (nesse caso, a entrada permanece — correto:
   * alguém mais está usando esta instância agora).
   */
  evictIfCurrent(tenantId: string, sessionName: string, expectedGeneration: number): boolean {
    const cacheKey = new WhatsAppSessionKey(tenantId, sessionName).toString();
    const sessionManager = this.sessionManagers.get(cacheKey);

    if (!sessionManager || sessionManager.getGeneration() !== expectedGeneration) {
      return false;
    }

    this.sessionManagers.delete(cacheKey);
    return true;
  }
}
