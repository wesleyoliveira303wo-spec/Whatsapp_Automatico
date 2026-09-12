import { Logger } from '../../../shared/domain/Logger';
import {
  WhatsAppProvider,
  ProfilePictureLookup,
} from '../domain/providers/WhatsAppProvider';
import { WhatsAppProviderEvent } from '../domain/providers/WhatsAppProviderEvent';
import { WhatsAppSessionRepository } from '../domain/repositories/WhatsAppSessionRepository';
import { WhatsAppSessionEventRepository } from '../domain/repositories/WhatsAppSessionEventRepository';
import { WhatsAppSession } from '../domain/entities/WhatsAppSession';
import { WhatsAppGroupSummary } from '../domain/entities/WhatsAppGroupSummary';
import { WhatsAppSessionKey } from '../domain/valueObjects/WhatsAppSessionKey';
import { WhatsAppSessionNotFoundError } from '../domain/errors/WhatsAppSessionNotFoundError';
import { MessageReceivedHandler } from '../domain/handlers/MessageReceivedHandler';

/**
 * Orquestra o ciclo de vida de UMA sessão do WhatsApp contra um
 * `WhatsAppProvider` + `WhatsAppSessionRepository`. Cada instância
 * corresponde a exatamente uma sessão/um provider (ver `WhatsAppProvider.
 * onEvent`) — quem cria/reaproveita instâncias para múltiplos tenants/
 * sessões é responsabilidade de um futuro `WhatsAppConnectionRegistry`
 * (Item 5, Bloco 5).
 *
 * Refatoração (Item 5, Bloco 3 — ver DECISIONS.md ADR #29): esta classe
 * antes recebia `tenantId`/`sessionName` como PARÂMETROS LIVRES em
 * `init()`, e `sessionId` como parâmetro livre em `getStatus()`/
 * `disconnect()` — apesar de a classe só poder gerenciar UMA sessão por
 * toda a sua vida. Isso permitia, em tese, chamar `init()` mais de uma vez
 * com identidades DIFERENTES na MESMA instância, ou invocar `getStatus()`/
 * `disconnect()` com o `sessionId` de outra sessão qualquer (o problema que
 * o extinto `WhatsAppSessionOwnershipError`/`assertOwnsSession` mitigava em
 * runtime — ver ADR #23, BUG-03).
 *
 * A correção estrutural (em vez de continuar checando em runtime) é:
 * identidade agora é uma ÚNICA `WhatsAppSessionKey` (Value Object, Bloco 1),
 * recebida no construtor e nunca mais alterada. `init()`, `getStatus()` e
 * `disconnect()` deixam de aceitar qualquer identificador externo — não há
 * mais nenhum parâmetro para divergir do que esta instância realmente
 * gerencia, então o BUG-03 deixa de ser possível por construção, não por
 * verificação. `WhatsAppSessionOwnershipError`/`assertOwnsSession` foram
 * REMOVIDOS (não fazem mais sentido: não há identidade externa para
 * validar contra a interna).
 *
 * IMPORTANTE — restrição obrigatória para qualquer mudança futura: `init()`,
 * `getStatus()` e `disconnect()` NUNCA devem voltar a aceitar um parâmetro
 * de identidade (sessionId/tenantId/sessionName). Reintroduzir isso reabre
 * o BUG-03 sem nenhum erro de compilação para avisar — é exatamente o tipo
 * de regressão que uma revisão de código precisa pegar manualmente, porque
 * o compilador não pega mais.
 *
 * Por que `WhatsAppSessionKey` (não `getTenantId()/getSessionName()` no
 * port `WhatsAppProvider`): a alternativa cogitada na revisão arquitetural
 * do Bloco 3 — adicionar esses dois métodos ao port — foi rejeitada por
 * ampliar desnecessariamente a interface pública de `WhatsAppProvider`
 * (todo futuro provider precisaria implementá-los só para satisfazer uma
 * necessidade interna da Application). Em vez disso, o futuro
 * `WhatsAppConnectionRegistry` (Bloco 5) cria UMA `WhatsAppSessionKey` e
 * repassa a mesma instância (ou os mesmos valores derivados, `tenantId`/
 * `sessionName`) tanto para a `WhatsAppProviderFactory.create(...)` quanto
 * para o construtor desta classe — a chave nunca é duplicada, só
 * compartilhada a partir de uma única fonte.
 *
 * Mutex de ciclo de vida (`lifecycleLock`, ver ADR #29, achado F3): serializa
 * `init()` e `disconnect()` entre si nesta instância — nunca `getStatus()`/
 * `getQRCode()`, que são leituras puras e devem continuar livres mesmo
 * durante uma conexão/desconexão em andamento (achado F5; bloqueá-las seria
 * uma regressão de UX, não uma proteção). Sem essa serialização, um
 * `disconnect()` chamado enquanto um `init()` está em andamento podia rodar
 * `teardownSocket()` do provider ANTES do socket novo ser criado por
 * `connect()` — e `connect()` prosseguia e criava o socket DEPOIS do
 * disconnect já ter "acontecido" (sessão continuava conectando apesar do
 * pedido explícito de desconexão).
 *
 * NOTA DE RISCO ACEITO (ADR #29, achado F4, deliberadamente NÃO resolvido
 * nesta milestone): não existe timeout em `provider.connect()` em lugar
 * nenhum do código. Se `connect()` nunca resolver nem rejeitar, uma chamada
 * de `disconnect()` enfileirada atrás dele no `lifecycleLock` fica
 * bloqueada indefinidamente — sem jeito de forçar a desconexão de uma
 * sessão travada via API, a não ser reiniciando o processo. Risco conhecido
 * e aceito por decisão explícita (mesmo precedente do achado F1/ADR #16),
 * não implementado aqui.
 *
 * Contador de `generation` (Production Hardening, Bloco 4 — ver
 * DECISIONS.md, revisão arquitetural de 2026-07-08, cinco rodadas de
 * auditoria adversarial): existe para permitir que
 * `WhatsAppConnectionRegistry.evictIfCurrent()` detecte, de forma segura, se
 * esta instância foi reconectada entre o momento em que um chamador capturou
 * sua geração e o momento em que tenta evictá-la do Map — fecha uma race
 * condition estrutural (não apenas estreita a janela) entre um
 * `disconnect()` em andamento e uma reconexão concorrente, seja ela via HTTP
 * (novo `init()`) OU via reconexão automática interna do Baileys após
 * `restartRequired`/515 (ver `BaileysProvider`, BUG-14/ADR #32).
 *
 * Por que o incremento vive dentro de `subscribeToProviderEvents` (reagindo
 * a `event.status === 'connecting'`) e não dentro de `doInit()`: o reconnect
 * automático do 515 é disparado INTERNAMENTE pelo `BaileysProvider` (chama
 * `this.connect()` diretamente, fora do `lifecycleLock`), nunca passando por
 * `SessionManager.init()`. O único ponto em comum entre a reconexão via HTTP
 * e a reconexão interna é o evento `status_changed` que o listener já
 * registrado (via `onEvent`) recebe de qualquer uma das duas origens — por
 * isso reaproveitar esse callback já existente, em vez de um novo hook em
 * `init()`, cobre AMBOS os casos sem alterar o contrato de `WhatsAppProvider`
 * (verificado lendo o código real do `BaileysProvider`, não suposto).
 *
 * IMPORTANTE — `generation` é um campo desta instância (`this.generation`),
 * nunca uma variável local capturada pela closure criada dentro de
 * `subscribeToProviderEvents()`: essa closure é recriada a cada reconexão
 * real (a cada `doInit()` que efetivamente chama `connect()`), então uma
 * variável local seria reiniciada a cada reconexão, anulando silenciosamente
 * todo o mecanismo. Só incrementar em `'connecting'` (nunca em
 * `getStatus()`/`getQRCode()`, que são leituras puras) é obrigatório:
 * incrementar em toda leitura impediria evicções legítimas em sistemas com
 * polling de status frequente, reabrindo o vazamento de memória que este
 * mecanismo existe para fechar.
 *
 * M2, Fase 2 (M2-B4) — `eventRepository` (`WhatsAppSessionEventRepository`,
 * novo port) é a ÚNICA mudança desta Fase neste arquivo: uma dependência a
 * mais no construtor e uma chamada a `append()` dentro de
 * `subscribeToProviderEvents`, logo depois de `this.repo.update(...)` (ver
 * lá). Nenhuma outra linha deste arquivo foi tocada — este é deliberadamente
 * o único ponto de todo o plano da Milestone 2 que encosta neste arquivo
 * (protegido por múltiplas rodadas de auditoria adversarial, ver ADRs
 * #23/#25/#29/#32/#42/#47), exatamente para manter esse raio de mudança
 * mínimo e auditável isoladamente.
 *
 * Milestone 3, Bloco 1 — `messageReceivedHandler` (`MessageReceivedHandler`,
 * novo port, OPCIONAL) é a única mudança deste Bloco neste arquivo: uma
 * dependência a mais no construtor (mesmo padrão de `eventRepository`) e um
 * novo ramo em `subscribeToProviderEvents` que repassa eventos
 * `message_received` a ela, se configurada. Sem handler (`undefined` — o
 * caso de todo composition root existente hoje, já que `services/
 * conversations/` só chega no Bloco 2), o evento é apenas ignorado — nunca
 * lançado, nunca logado como erro, porque a ausência de handler não é uma
 * falha, é o estado normal antes do Bloco 2 existir.
 */
export class SessionManager {
  private readonly provider: WhatsAppProvider;
  private readonly sessionKey: WhatsAppSessionKey;
  private readonly repo: WhatsAppSessionRepository;
  private readonly logger: Logger;
  private readonly eventRepository: WhatsAppSessionEventRepository;
  private readonly messageReceivedHandler: MessageReceivedHandler | undefined;

  /**
   * `id` da sessão persistida que esta instância representa, uma vez
   * conhecido (por `init()` ou pela resolução preguiçosa em `getStatus()`/
   * `disconnect()`). `undefined` até a primeira vez que for descoberto.
   */
  private ownedSessionId: string | undefined;

  /**
   * Fila de promises encadeadas usada como mutex de ciclo de vida — ver
   * docstring da classe e de `withLifecycleLock`. Começa resolvida (não há
   * nenhuma operação em andamento).
   */
  private lifecycleLock: Promise<unknown> = Promise.resolve();

  /**
   * Contador de geração — ver docstring da classe. Incrementado somente
   * dentro de `subscribeToProviderEvents()`, nunca em `getStatus()`/
   * `getQRCode()`. Começa em 0; a primeira conexão real leva a 1.
   */
  private generation = 0;

  constructor(
    provider: WhatsAppProvider,
    sessionKey: WhatsAppSessionKey,
    repo: WhatsAppSessionRepository,
    logger: Logger,
    eventRepository: WhatsAppSessionEventRepository,
    messageReceivedHandler?: MessageReceivedHandler,
  ) {
    this.provider = provider;
    this.sessionKey = sessionKey;
    this.repo = repo;
    this.logger = logger;
    this.eventRepository = eventRepository;
    this.messageReceivedHandler = messageReceivedHandler;
  }

  /**
   * Inicia a sessão ou reconecta a existente. Sempre a MESMA identidade
   * (`this.sessionKey`), fixada no construtor — nunca mais um parâmetro
   * livre (ver docstring da classe).
   */
  async init(): Promise<WhatsAppSession> {
    return this.withLifecycleLock(() => this.doInit());
  }

  /** Encerra a conexão ativa desta sessão. Idempotente: chamar numa sessão
   * nunca inicializada (nem nesta instância, nem persistida) não lança —
   * apenas não há nada para persistir como desconectado. */
  async disconnect(): Promise<void> {
    return this.withLifecycleLock(() => this.doDisconnect());
  }

  /**
   * Consulta o status atual, combinando o registro persistido com o status
   * AO VIVO do provider (nunca confia isoladamente no que está no banco —
   * ver ADR #23, BUG-02). Deliberadamente FORA do `lifecycleLock`: é uma
   * leitura pura, sem nenhuma escrita via `provider`, e precisa continuar
   * respondendo mesmo com um `init()`/`disconnect()` em andamento (é
   * exatamente quando um cliente mais quer ver o progresso, ex.: "conectando...").
   */
  async getStatus(): Promise<WhatsAppSession> {
    const sessionId = await this.resolveOwnedSessionId();
    if (sessionId === undefined) {
      this.logger.warn('Consulta de status para sessão inexistente', {
        tenantId: this.sessionKey.tenantId,
        sessionName: this.sessionKey.sessionName,
      });
      throw new WhatsAppSessionNotFoundError(this.describeSessionKey());
    }

    const session = await this.repo.findById(sessionId);
    if (!session) {
      this.logger.warn('Sessão referenciada por id não encontrada no repositório', { sessionId });
      throw new WhatsAppSessionNotFoundError(sessionId);
    }

    const status = await this.provider.getStatus();
    return { ...session, status };
  }

  /** QR Code atual — delega diretamente ao provider. Mesmo motivo de
   * `getStatus()` para ficar fora do `lifecycleLock`: leitura pura. */
  async getQRCode(): Promise<string> {
    return this.provider.getQRCode();
  }

  /**
   * Envia uma mensagem de texto através da sessão desta instância —
   * Milestone 3, Bloco 4 (gap aditivo previsto desde o §2.8/ADR #54 da
   * arquitetura da milestone: "um novo método de envio em `SessionManager`
   * que `OutboundCommandConsumer` chama em vez de tocar o `provider`
   * diretamente"). Delega inteiramente a `provider.sendMessage(to,
   * content)` — mesmo padrão de `getQRCode()`/`getStatus()` (thin
   * passthrough), sem lock de ciclo de vida: enviar uma mensagem não é uma
   * transição de `init()`/`disconnect()`, é uma operação independente sobre
   * uma sessão já conectada.
   *
   * `to` é dado de CADA chamada, nunca a identidade desta instância — mesma
   * distinção já documentada em `WhatsAppProvider.sendMessage()`, que
   * também não viola a restrição da ADR #29 (`SessionManager` não aceita
   * parâmetro de IDENTIDADE DA SESSÃO — `to` é o destinatário, não a
   * sessão). Propaga `WhatsAppNotConnectedError` do provider sem capturar:
   * quem chama (`OutboundCommandConsumer`, Bloco 4) decide o que fazer com
   * uma sessão sem conexão viva (ver decisão D4 do levantamento
   * arquitetural do Bloco 4 — falhar o job, deixar o BullMQ reter/
   * reprocessar, nunca reconectar automaticamente aqui).
   */
  async sendMessage(to: string, content: string): Promise<void> {
    await this.provider.sendMessage(to, content);
  }

  /**
   * Envia mídia — Fase 1, Bloco F1.3. Thin passthrough, mesmo padrão de
   * `sendMessage`/`downloadMedia`: sem lock de ciclo de vida (não interfere
   * com `init()`/`disconnect()` em andamento), propaga
   * `WhatsAppNotConnectedError` sem capturar.
   */
  async sendMediaMessage(
    to: string,
    media: {
      contentType: 'image' | 'audio' | 'video' | 'document';
      buffer: Buffer;
      mimeType: string;
      caption?: string;
      fileName?: string;
    },
  ): Promise<void> {
    await this.provider.sendMediaMessage(to, media);
  }

  /**
   * URL da foto de perfil de `jid` — Milestone 6, Bloco M6H-2b. Mesmo padrão
   * de `getQRCode()`/`sendMessage()`: thin passthrough ao `provider`, sem
   * lock de ciclo de vida (leitura independente, não uma transição de
   * `init()`/`disconnect()`). Nunca lança (ver `WhatsAppProvider.
   * getProfilePictureUrl`) — `undefined` é um resultado normal, não
   * propagado como erro.
   */
  async getProfilePictureUrl(jid: string): Promise<string | undefined> {
    return this.provider.getProfilePictureUrl(jid);
  }

  /**
   * Passthrough da consulta INSTRUMENTADA (2026-09-05) — diz se a foto foi
   * encontrada, se não existe, ou se não deu para perguntar. Ver
   * `WhatsAppProvider.lookupProfilePicture`.
   */
  async lookupProfilePicture(jid: string, timeoutMs?: number): Promise<ProfilePictureLookup> {
    return this.provider.lookupProfilePicture(jid, timeoutMs);
  }

  /**
   * Baixa e descriptografa o binário de uma mídia de mensagem (Fase 1,
   * Bloco F1.1, ADR #90) — mesmo padrão de thin passthrough de
   * `getProfilePictureUrl`/`sendMessage`.
   */
  async downloadMedia(media: {
    contentType: 'image' | 'audio' | 'video' | 'document' | 'sticker';
    mimeType: string;
    url: string;
    mediaKeyEncrypted: string;
  }): Promise<Buffer | undefined> {
    return this.provider.downloadMedia(media);
  }

  /**
   * Grupos dos quais o número desta sessão participa — Disparos em grupos
   * (2026-09-11). Thin passthrough, mesmo padrão de `getProfilePictureUrl`/
   * `downloadMedia`: sem lock de ciclo de vida (leitura independente).
   * Propaga `WhatsAppNotConnectedError`/`WhatsAppGroupsFetchTimeoutError` do
   * provider sem capturar — quem chama decide como apresentar cada caso.
   */
  async listGroups(timeoutMs?: number): Promise<WhatsAppGroupSummary[]> {
    return this.provider.listGroups(timeoutMs);
  }

  /**
   * Geração atual desta instância — ver docstring da classe e do campo
   * `generation`. Usado por `WhatsAppConnectionRegistry.evictIfCurrent()`
   * para decidir, com segurança, se é seguro remover esta instância do seu
   * Map (só se ninguém reconectou desde que o chamador capturou este valor).
   * Leitura pura, síncrona, sem efeito colateral — mesma categoria de
   * `getStatus()`/`getQRCode()`.
   */
  getGeneration(): number {
    return this.generation;
  }

  /**
   * Serializa `init()` e `disconnect()` entre si nesta instância (nunca
   * `getStatus()`/`getQRCode()` — ver docstring da classe, achados F3/F5).
   *
   * Implementado como uma fila de promises encadeadas: cada operação só
   * começa depois que a anterior (seja ela `init` ou `disconnect`) tiver
   * terminado — com sucesso ou falha, tanto faz; uma falha na operação
   * anterior nunca deve travar a fila para sempre (por isso o `.then` que
   * atualiza `lifecycleLock` sempre resolve, nunca propaga rejeição).
   *
   * Como `operation` é passado como handler tanto de sucesso quanto de
   * falha do elo anterior da fila, ele sempre roda na sua vez,
   * independentemente do resultado da operação anterior.
   *
   * A atualização de `this.lifecycleLock` (leitura + escrita do campo)
   * acontece de forma síncrona, sem nenhum `await` no meio — a garantia de
   * single-thread do event loop do Node impede que duas chamadas
   * concorrentes a este método intercalem entre si nesse trecho, então não
   * há corrida na própria contabilidade da fila.
   */
  private async withLifecycleLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.lifecycleLock.then(operation, operation);
    this.lifecycleLock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Resolve o `id` da sessão que esta instância representa, sem lançar se
   * não existir (usado por `getStatus()`, que decide o que fazer com
   * `undefined`, e por `disconnect()`, que trata a ausência como no-op).
   * Faz cache em `ownedSessionId` assim que descoberto — chamadas
   * subsequentes não repetem a consulta ao repositório.
   */
  private async resolveOwnedSessionId(): Promise<string | undefined> {
    if (this.ownedSessionId !== undefined) {
      return this.ownedSessionId;
    }
    const existing = await this.repo.findByTenantAndSessionName(
      this.sessionKey.tenantId,
      this.sessionKey.sessionName,
    );
    if (existing) {
      this.ownedSessionId = existing.id;
    }
    return this.ownedSessionId;
  }

  private describeSessionKey(): string {
    return `tenantId=${this.sessionKey.tenantId}, sessionName=${this.sessionKey.sessionName}`;
  }

  /**
   * Corpo de fato de `init()` — ver `withLifecycleLock`. Reaproveita/
   * atualiza a sessão existente ao reconectar (nunca cria duplicata — ver
   * `@@unique([tenantId, sessionName])` em `prisma/schema.prisma`) e assina
   * `onEvent` (via `subscribeToProviderEvents`) — antes de chamar
   * `connect()` (ver ADR #23, BUG-01) — para manter o registro atualizado
   * depois de retornar. O "reaproveitar sem reconectar" só acontece quando
   * `provider.getStatus()` (não o banco isoladamente) confirma que já existe
   * conexão viva NESTE processo (ADR #23, BUG-02).
   */
  private async doInit(): Promise<WhatsAppSession> {
    const { tenantId, sessionName } = this.sessionKey;
    this.logger.debug('Iniciando sessão do WhatsApp', { tenantId, sessionName });

    const existing = await this.repo.findByTenantAndSessionName(tenantId, sessionName);

    if (existing) {
      const liveStatus = await this.provider.getStatus();
      if (liveStatus === 'connected' || liveStatus === 'connecting') {
        this.ownedSessionId = existing.id;
        const phoneNumber = await this.provider.getPhoneNumber();
        const reused: WhatsAppSession = {
          ...existing,
          status: liveStatus,
          phoneNumber: phoneNumber ?? existing.phoneNumber,
        };
        this.logger.info('Sessão já ativa neste processo, reaproveitando sem reconectar', {
          tenantId,
          sessionName,
          sessionId: existing.id,
          liveStatus,
        });
        return reused;
      }
    }

    const now = new Date();

    const candidateSession: WhatsAppSession = existing
      ? { ...existing, status: 'connecting', lastSeen: now, updatedAt: now }
      : {
          id: crypto.randomUUID(),
          tenantId,
          sessionName,
          provider: 'baileys',
          status: 'connecting',
          phoneNumber: undefined,
          connectedAt: undefined,
          lastSeen: now,
          createdAt: now,
          updatedAt: now,
        };

    // Upsert atômico (corrige o P6, ver ADR #25): fecha a janela de corrida
    // entre a leitura de `existing` acima e esta escrita. O `id` definitivo
    // desta sessão é sempre o do RETORNO do upsert, nunca o `id`
    // especulativo gerado em `candidateSession` acima.
    const initialSession = await this.repo.upsertByTenantAndSessionName(
      tenantId,
      sessionName,
      candidateSession,
      {
        status: 'connecting',
        lastSeen: now,
        updatedAt: now,
      },
    );
    const sessionId = initialSession.id;

    this.ownedSessionId = sessionId;
    // Assina ANTES de conectar (corrige BUG-01) — ver docstring da classe.
    this.subscribeToProviderEvents(sessionId);

    await this.provider.connect();

    const status = await this.provider.getStatus();
    const phoneNumber = await this.provider.getPhoneNumber();
    const finalNow = new Date();
    const updates: Partial<WhatsAppSession> = {
      status,
      lastSeen: finalNow,
      updatedAt: finalNow,
    };
    if (phoneNumber !== undefined) {
      updates.phoneNumber = phoneNumber;
    }
    if (status === 'connected') {
      updates.connectedAt = finalNow;
    }
    await this.repo.update(sessionId, updates);
    const session: WhatsAppSession = { ...initialSession, ...updates };

    this.logger.info('Sessão do WhatsApp conectada/atualizada', {
      tenantId,
      sessionName,
      sessionId: session.id,
      status: session.status,
      reused: Boolean(existing),
    });

    return session;
  }

  /**
   * Corpo de fato de `disconnect()` — ver `withLifecycleLock`. Idempotente
   * por desenho: se esta sessão nunca foi resolvida (nem por `init()` nesta
   * instância, nem encontrada no repositório), não há `sessionId` para
   * persistir contra — ainda assim chama `provider.disconnect()` (seguro
   * mesmo sem conexão ativa, ver `BaileysProvider.teardownSocket()`), só
   * pula a escrita no repositório.
   */
  private async doDisconnect(): Promise<void> {
    const sessionId = await this.resolveOwnedSessionId();
    await this.provider.disconnect();
    if (sessionId !== undefined) {
      await this.repo.update(sessionId, { status: 'disconnected', lastSeen: new Date() });
    }
    this.logger.info('Sessão do WhatsApp desconectada', { sessionId });
  }

  /**
   * Persiste, de forma assíncrona, eventos que o provider reporta depois de
   * `init()` já ter retornado (ex.: pareamento confirmado, queda de
   * conexão, mensagem recebida). Reage a `'status_changed'` (lógica
   * original, inalterada abaixo) e, desde a Milestone 3/Bloco 1, também a
   * `'message_received'` (repassado a `messageReceivedHandler`, se
   * configurado — ver docstring da classe); qualquer outro tipo de evento
   * futuro continua sendo ignorado sem erro (early return).
   */
  private subscribeToProviderEvents(sessionId: string): void {
    const { tenantId, sessionName } = this.sessionKey;
    this.provider.onEvent(async (event: WhatsAppProviderEvent) => {
      if (event.type === 'message_received') {
        if (!this.messageReceivedHandler) {
          return;
        }
        try {
          await this.messageReceivedHandler.handle({
            tenantId,
            sessionName,
            from: event.from,
            content: event.content,
            receivedAt: event.receivedAt,
            // ADR #97: repassa a direção da mensagem; `undefined` ≡ 'inbound'
            // (compatibilidade total com eventos anteriores a esta extensão).
            direction: event.direction,
            contactName: event.contactName,
            // Fase 1, Bloco F1.1 (ADR #90) — repassa tipo/referência de
            // mídia ao handler sem interpretar o conteúdo (SessionManager só
            // roteia eventos, nunca decide o que fazer com eles).
            contentType: event.contentType,
            media: event.media,
          });
        } catch (error) {
          this.logger.error('Falha ao repassar mensagem recebida ao MessageReceivedHandler', {
            tenantId,
            sessionName,
            error,
          });
        }
        return;
      }

      if (event.type !== 'status_changed') {
        return;
      }

      // Incrementa a geração (ver docstring da classe) ANTES do try/catch de
      // persistência abaixo: a contagem é um contador em memória, não deve
      // depender do sucesso da escrita no repositório. Reage apenas a
      // 'connecting' — nunca em transições de leitura pura (não há nenhuma
      // aqui, mas o contrato é: só uma reconexão real avança a geração).
      if (event.status === 'connecting') {
        this.generation++;
      }

      try {
        const now = new Date();
        const changes: Partial<WhatsAppSession> = {
          status: event.status,
          // Sempre incluído (Production Hardening, Bloco 8a) — mesmo
          // quando `event.disconnectReason` é `undefined` (transições para
          // 'connecting'/'connected'). Diferente de `phoneNumber`/
          // `connectedAt` abaixo (que só entram em `changes` quando o
          // evento traz um valor novo, preservando o que já está persistido
          // quando não trazem): aqui `undefined` é um valor VÁLIDO e
          // INTENCIONAL vindo do provider ("motivo limpo, sessão
          // reconectando"), não "sem informação nova". Se este campo fosse
          // condicional como os demais, a limpeza nunca chegaria ao banco —
          // ver o guard por presença de chave (`'disconnectReason' in
          // data`), não por valor, em `PrismaWhatsAppSessionRepository.update()`.
          disconnectReason: event.disconnectReason,
          lastSeen: now,
          updatedAt: now,
        };
        if (event.status === 'connected') {
          changes.connectedAt = now;
        }
        if (event.phoneNumber !== undefined) {
          changes.phoneNumber = event.phoneNumber;
        }
        await this.repo.update(sessionId, changes);
        // M2, Fase 2 (M2-B4) — grava a MESMA transição no histórico
        // append-only (`WhatsAppSessionEvent`), reaproveitando o único
        // `now` já capturado acima para este evento (evita qualquer
        // divergência de timestamp entre o estado atual e o log). Dentro do
        // mesmo try/catch que já envolve `this.repo.update`: uma falha ao
        // gravar o histórico é tratada com a mesma política já existente
        // (logada, nunca propagada) — o histórico é um registro auxiliar,
        // sua falha não deve derrubar a atualização de status em si, que é
        // o dado operacional que já era persistido antes desta Fase.
        await this.eventRepository.append({
          tenantId,
          sessionName,
          status: event.status,
          disconnectReason: event.disconnectReason,
          occurredAt: now,
        });
        this.logger.debug('Atualização assíncrona de status persistida', {
          tenantId,
          sessionName,
          sessionId,
          status: event.status,
        });
      } catch (error) {
        this.logger.error('Falha ao persistir atualização assíncrona de status', {
          tenantId,
          sessionName,
          sessionId,
          error,
        });
      }
    });
  }
}
