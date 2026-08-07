import { SessionManager } from '../../../src/services/whatsapp/application/SessionManager';
import { WhatsAppProvider } from '../../../src/services/whatsapp/domain/providers/WhatsAppProvider';
import { WhatsAppProviderEvent } from '../../../src/services/whatsapp/domain/providers/WhatsAppProviderEvent';
import { WhatsAppSession } from '../../../src/services/whatsapp/domain/entities/WhatsAppSession';
import { WhatsAppSessionKey } from '../../../src/services/whatsapp/domain/valueObjects/WhatsAppSessionKey';
import { WhatsAppSessionNotFoundError } from '../../../src/services/whatsapp/domain/errors/WhatsAppSessionNotFoundError';
import { Logger } from '../../../src/shared/domain/Logger';
import {
  FakeWhatsAppSessionRepository,
  FakeWhatsAppSessionEventRepository,
  FakeMessageReceivedHandler,
} from './testDoubles';

/**
 * Fake do provider — não depende do Baileys nem de rede. Serve só para
 * validar a lógica do SessionManager (Application), isolada de qualquer
 * detalhe de Infrastructure. Simula tanto o lado síncrono (connect/
 * getStatus) quanto o lado assíncrono/orientado a eventos (onEvent),
 * espelhando o que um provider real (Baileys) precisa suportar.
 *
 * `status` inicia em `'disconnected'` (não `'connected'`) deliberadamente —
 * é exatamente o comportamento honesto de um `BaileysProvider` recém-criado
 * que nunca teve `connect()` chamado nesta instância/processo. Um Fake que
 * "mentisse" começando como `'connected'` mascararia o BUG-02 (auditoria de
 * 2026-07-06): o `SessionManager` antigo confiava cegamente no status
 * persistido no banco, sem nunca perguntar ao provider se existe conexão
 * viva NESTE processo — e um Fake sempre "conectado por padrão" nunca
 * exporia essa lacuna em teste algum.
 *
 * Interface `WhatsAppProvider` NÃO mudou no Bloco 3 (decisão explícita da
 * revisão arquitetural: identidade fica na `WhatsAppSessionKey`, não em
 * métodos novos no provider) — este Fake não precisou de nenhum método
 * novo por causa da refatoração do SessionManager.
 */
class FakeWhatsAppProvider implements WhatsAppProvider {
  public connectCalls = 0;
  public disconnectCalls = 0;
  public status: WhatsAppSession['status'] = 'disconnected';
  public phoneNumber: string | undefined = '+5511999999999';
  public qrCode = 'fake-qr-code';
  /**
   * Se definido, `connect()` emite este evento de forma síncrona, como
   * parte da própria chamada — simula um provider real (Baileys) que pode
   * notificar uma mudança de estado quase imediatamente após iniciar a
   * conexão, antes que o chamador necessariamente já tenha registrado um
   * listener, caso a ordem de chamadas esteja errada (ver BUG-01,
   * DECISIONS.md ADR #23).
   */
  public autoEmitOnConnect: WhatsAppProviderEvent | undefined;
  /**
   * Se definido, `connect()` aguarda esta Promise ANTES de concluir (contar
   * a chamada, mudar o status, emitir `autoEmitOnConnect`). Usado para
   * simular um `connect()` lento/em andamento, controlável pelo teste —
   * necessário para provar o mutex de ciclo de vida introduzido no Bloco 3
   * (ADR #29, achado F3: `disconnect()` deve aguardar um `init()` em
   * andamento antes de rodar).
   */
  public connectGate: Promise<void> | undefined;
  private listener: ((event: WhatsAppProviderEvent) => void) | undefined;

  async connect(): Promise<void> {
    if (this.connectGate) {
      await this.connectGate;
    }
    this.connectCalls += 1;
    this.status = 'connected';
    if (this.autoEmitOnConnect) {
      this.emitEvent(this.autoEmitOnConnect);
    }
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    this.status = 'disconnected';
  }

  async getStatus(): Promise<WhatsAppSession['status']> {
    return this.status;
  }

  async getQRCode(): Promise<string> {
    return this.qrCode;
  }

  async getPhoneNumber(): Promise<string | undefined> {
    return this.phoneNumber;
  }

  /** Registra chamadas (Milestone 3, Bloco 1). Milestone 3, Bloco 4:
   * `SessionManager.sendMessage()` (novo) delega diretamente aqui — ver
   * `describe('sendMessage', ...)` abaixo. */
  public sendMessageCalls: { to: string; content: string }[] = [];

  /** Milestone 3, Bloco 4: se definido, a próxima chamada a `sendMessage()`
   * rejeita com este erro (simula `WhatsAppNotConnectedError` do provider
   * real), em vez de registrar a chamada — usado para provar que
   * `SessionManager.sendMessage()` propaga, não engole. */
  public nextSendMessageError: Error | undefined;

  async sendMessage(to: string, content: string): Promise<void> {
    if (this.nextSendMessageError) {
      const error = this.nextSendMessageError;
      this.nextSendMessageError = undefined;
      throw error;
    }
    this.sendMessageCalls.push({ to, content });
  }

  onEvent(listener: (event: WhatsAppProviderEvent) => void): void {
    this.listener = listener;
  }

  /** Helper de teste: só entrega o evento se já houver listener registrado
   * — espelha `BaileysProvider.emitStatusChanged()`, que usa `?.()` e
   * descarta silenciosamente se ninguém assinou ainda (é exatamente esse
   * comportamento que expõe o BUG-01 quando a ordem de chamadas está errada). */
  emitEvent(event: WhatsAppProviderEvent): void {
    this.listener?.(event);
  }

  /** Helper de teste: indica se algum listener já foi registrado. */
  hasListener(): boolean {
    return this.listener !== undefined;
  }

  /** Milestone 6, Bloco M6H-2b — inerte por padrão, mesmo racional de `phoneNumber`/`qrCode`. */
  public profilePictureUrl: string | undefined;

  async getProfilePictureUrl(_jid: string): Promise<string | undefined> {
    return this.profilePictureUrl;
  }

  /** Fase 1, Bloco F1.1 — inerte por padrão, mesmo racional de `profilePictureUrl`. */
  public downloadMediaResult: Buffer | undefined;

  async downloadMedia(_media: {
    contentType: 'image' | 'audio' | 'video' | 'document' | 'sticker';
    mimeType: string;
    url: string;
    mediaKeyEncrypted: string;
  }): Promise<Buffer | undefined> {
    return this.downloadMediaResult;
  }

  /** Fase 1, Bloco F1.3 — registra chamadas, mesmo racional de `sendMessageCalls`/`nextSendMessageError`. */
  public sendMediaMessageCalls: {
    to: string;
    media: {
      contentType: 'image' | 'audio' | 'video' | 'document';
      buffer: Buffer;
      mimeType: string;
      caption?: string;
      fileName?: string;
    };
  }[] = [];

  public nextSendMediaMessageError: Error | undefined;

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
    if (this.nextSendMediaMessageError) {
      const error = this.nextSendMediaMessageError;
      this.nextSendMediaMessageError = undefined;
      throw error;
    }
    this.sendMediaMessageCalls.push({ to, media });
  }
}

interface RecordedLogCall {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown>;
}

/**
 * Fake (spy) do Logger — grava cada chamada para permitir asserções sobre
 * o que o SessionManager loga, sem depender de nenhuma implementação real
 * (ConsoleLogger/Winston).
 */
class FakeLogger implements Logger {
  public calls: RecordedLogCall[] = [];
  private readonly bindings: Record<string, unknown>;

  constructor(bindings: Record<string, unknown> = {}) {
    this.bindings = bindings;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.record('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.record('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.record('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.record('error', message, meta);
  }

  child(bindings: Record<string, unknown>): Logger {
    return new FakeLogger({ ...this.bindings, ...bindings });
  }

  private record(
    level: RecordedLogCall['level'],
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    this.calls.push({ level, message, meta: { ...this.bindings, ...meta } });
  }
}

function buildSut(
  tenantId = 'tenant-1',
  sessionName = 'default',
  messageReceivedHandler?: FakeMessageReceivedHandler,
): {
  sessionManager: SessionManager;
  provider: FakeWhatsAppProvider;
  repo: FakeWhatsAppSessionRepository;
  eventRepo: FakeWhatsAppSessionEventRepository;
  logger: FakeLogger;
  sessionKey: WhatsAppSessionKey;
} {
  const provider = new FakeWhatsAppProvider();
  const repo = new FakeWhatsAppSessionRepository();
  const eventRepo = new FakeWhatsAppSessionEventRepository();
  const logger = new FakeLogger();
  const sessionKey = new WhatsAppSessionKey(tenantId, sessionName);
  const sessionManager = new SessionManager(
    provider,
    sessionKey,
    repo,
    logger,
    eventRepo,
    messageReceivedHandler,
  );
  return { sessionManager, provider, repo, eventRepo, logger, sessionKey };
}

describe('SessionManager', () => {
  describe('init', () => {
    it('deve conectar e criar uma nova sessão quando nenhuma existir para tenant+sessionName', async () => {
      const { sessionManager, provider, repo } = buildSut();

      const session = await sessionManager.init();

      expect(provider.connectCalls).toBe(1);
      expect(session.tenantId).toBe('tenant-1');
      expect(session.sessionName).toBe('default');
      expect(session.status).toBe('connected');
      expect(session.provider).toBe('baileys');
      expect(session.phoneNumber).toBe('+5511999999999');

      const persisted = await repo.findById(session.id);
      expect(persisted).toEqual(session);
    });

    it('não deve reconectar quando o provider já estiver ativo NESTE processo para a sessão existente', async () => {
      const { sessionManager, provider, repo } = buildSut();
      const existingSession: WhatsAppSession = {
        id: 'existing-id',
        tenantId: 'tenant-1',
        sessionName: 'default',
        provider: 'baileys',
        status: 'connected',
        phoneNumber: '+5511888888888',
        connectedAt: new Date(),
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      repo.seed(existingSession);
      // Simula um provider que já está com socket vivo NESTE processo (ex.:
      // init() chamado duas vezes na mesma instância) — só nesse caso o
      // reaproveitamento sem reconectar é correto.
      provider.status = 'connected';

      const result = await sessionManager.init();

      expect(provider.connectCalls).toBe(0);
      expect(result.id).toBe('existing-id');
      expect(result.status).toBe('connected');
    });

    it('[BUG-02] deve reconectar de verdade após restart do processo, mesmo com status "connected" persistido no banco', async () => {
      const { sessionManager, provider, repo } = buildSut();
      repo.seed({
        id: 'existing-id',
        tenantId: 'tenant-1',
        sessionName: 'default',
        provider: 'baileys',
        // Estado persistido de uma vida anterior do processo (antes de um
        // restart/crash) — o banco não sabe que o processo reiniciou.
        status: 'connected',
        phoneNumber: '+5511888888888',
        connectedAt: new Date(),
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // `provider` é uma instância NOVA, nunca conectada neste processo —
      // reflete exatamente o cenário de um restart do servidor (um
      // BaileysProvider recém-criado sempre começa 'disconnected').
      expect(provider.status).toBe('disconnected');

      const result = await sessionManager.init();

      expect(provider.connectCalls).toBe(1);
      expect(result.id).toBe('existing-id');
      const persisted = await repo.findById('existing-id');
      expect(persisted?.status).toBe('connected'); // resultado do connect() real, não do valor stale
    });

    it('deve chamar o provider para reconectar quando a sessão existente não estiver conectada', async () => {
      const { sessionManager, provider, repo } = buildSut();
      repo.seed({
        id: 'existing-id',
        tenantId: 'tenant-1',
        sessionName: 'default',
        provider: 'baileys',
        status: 'disconnected',
        connectedAt: new Date(),
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await sessionManager.init();

      expect(provider.connectCalls).toBe(1);
    });

    it('deve reaproveitar o registro existente ao reconectar, sem criar duplicata (respeita @@unique([tenantId, sessionName]))', async () => {
      const { sessionManager, repo } = buildSut();
      repo.seed({
        id: 'existing-id',
        tenantId: 'tenant-1',
        sessionName: 'default',
        provider: 'baileys',
        status: 'disconnected',
        connectedAt: undefined,
        lastSeen: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });

      const result = await sessionManager.init();

      expect(result.id).toBe('existing-id');
      const all = await repo.findAllByTenant('tenant-1');
      expect(all).toHaveLength(1);
      expect(all[0].status).toBe('connected');
    });

    it('deve isolar sessões por tenant: mesmo sessionName em tenants diferentes não colide (repositório compartilhado, instâncias separadas)', async () => {
      // Adaptado no Bloco 3: antes do refactor, este teste chamava
      // `init(tenantId, sessionName)` DUAS VEZES com identidades diferentes
      // na MESMA instância de SessionManager — exatamente o padrão que a
      // refatoração (ADR #29) torna estruturalmente impossível (identidade
      // agora é fixada no construtor via WhatsAppSessionKey, nunca mais um
      // parâmetro de chamada). O cenário real equivalente é o futuro
      // WhatsAppConnectionRegistry (Bloco 5) construindo DUAS instâncias
      // separadas — uma por tenant — compartilhando o mesmo repositório.
      const repo = new FakeWhatsAppSessionRepository();
      const sessionManagerA = new SessionManager(
        new FakeWhatsAppProvider(),
        new WhatsAppSessionKey('tenant-a', 'default'),
        repo,
        new FakeLogger(),
        new FakeWhatsAppSessionEventRepository(),
      );
      const sessionManagerB = new SessionManager(
        new FakeWhatsAppProvider(),
        new WhatsAppSessionKey('tenant-b', 'default'),
        repo,
        new FakeLogger(),
        new FakeWhatsAppSessionEventRepository(),
      );

      const sessionA = await sessionManagerA.init();
      const sessionB = await sessionManagerB.init();

      expect(sessionA.id).not.toBe(sessionB.id);
      // `findAllByTenant()` é escopado por design (M2, Fase 1 — corrige o
      // vazamento cross-tenant que `findAll()` global permitia); a prova de
      // isolamento aqui é justamente que CADA tenant enxerga só a própria
      // linha, nunca a do outro.
      expect(await repo.findAllByTenant('tenant-a')).toHaveLength(1);
      expect(await repo.findAllByTenant('tenant-b')).toHaveLength(1);
    });

    it('deve assinar atualizações assíncronas do provider e persistir mudanças de status', async () => {
      const { sessionManager, provider, repo } = buildSut();
      const session = await sessionManager.init();

      provider.emitEvent({ type: 'status_changed', status: 'disconnected' });
      // handler é async; aguarda a microtask resolver
      await Promise.resolve();
      await Promise.resolve();

      const updated = await repo.findById(session.id);
      expect(updated?.status).toBe('disconnected');
      // connectedAt anterior deve ser preservado, não apagado pelo evento
      expect(updated?.connectedAt).toEqual(session.connectedAt);
    });

    describe('Production Hardening, Bloco 8a — persistência de disconnectReason', () => {
      it('persiste o disconnectReason vindo do evento status_changed', async () => {
        const { sessionManager, provider, repo } = buildSut();
        const session = await sessionManager.init();

        provider.emitEvent({
          type: 'status_changed',
          status: 'disconnected',
          disconnectReason: 'logged_out',
        });
        await Promise.resolve();
        await Promise.resolve();

        const updated = await repo.findById(session.id);
        expect(updated?.disconnectReason).toBe('logged_out');
      });

      it('limpa o disconnectReason persistido quando o provider emite status_changed sem motivo (reconectando)', async () => {
        const { sessionManager, provider, repo } = buildSut();
        const session = await sessionManager.init();

        provider.emitEvent({
          type: 'status_changed',
          status: 'disconnected',
          disconnectReason: 'connection_lost',
        });
        await Promise.resolve();
        await Promise.resolve();
        expect((await repo.findById(session.id))?.disconnectReason).toBe('connection_lost');

        // Provider reconecta e não traz mais nenhum motivo (undefined) —
        // isso precisa LIMPAR o valor antigo persistido, não deixá-lo preso.
        provider.emitEvent({ type: 'status_changed', status: 'connecting' });
        await Promise.resolve();
        await Promise.resolve();

        expect((await repo.findById(session.id))?.disconnectReason).toBeUndefined();
      });
    });

    describe('M2, Fase 2 (M2-B4) — histórico append-only de transições (WhatsAppSessionEvent)', () => {
      it('grava um evento de histórico para cada status_changed recebido do provider', async () => {
        const { sessionManager, provider, eventRepo, sessionKey } = buildSut();
        await sessionManager.init();

        provider.emitEvent({
          type: 'status_changed',
          status: 'disconnected',
          disconnectReason: 'connection_lost',
        });
        await Promise.resolve();
        await Promise.resolve();

        const history = await eventRepo.listRecentByTenantAndSessionName(
          sessionKey.tenantId,
          sessionKey.sessionName,
          10,
        );
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({
          tenantId: sessionKey.tenantId,
          sessionName: sessionKey.sessionName,
          status: 'disconnected',
          disconnectReason: 'connection_lost',
        });
      });

      it('acumula múltiplos eventos na ordem certa (mais novo primeiro)', async () => {
        const { sessionManager, provider, eventRepo, sessionKey } = buildSut();
        await sessionManager.init();

        provider.emitEvent({
          type: 'status_changed',
          status: 'disconnected',
          disconnectReason: 'timed_out',
        });
        await Promise.resolve();
        await Promise.resolve();
        // Espera real entre os dois eventos — garante `occurredAt`
        // mensuravelmente diferente (ver nota equivalente em
        // WhatsAppSessionService.test.ts).
        await new Promise((resolve) => setTimeout(resolve, 2));
        provider.emitEvent({ type: 'status_changed', status: 'connecting' });
        await Promise.resolve();
        await Promise.resolve();

        const history = await eventRepo.listRecentByTenantAndSessionName(
          sessionKey.tenantId,
          sessionKey.sessionName,
          10,
        );
        expect(history).toHaveLength(2);
        expect(history[0].status).toBe('connecting'); // mais recente primeiro
        expect(history[1].status).toBe('disconnected');
      });

      it('uma falha ao gravar o histórico não impede a persistência do status atual (mesma política de tolerância já usada para repo.update)', async () => {
        const { sessionManager, provider, repo, eventRepo, logger } = buildSut();
        const session = await sessionManager.init();
        eventRepo.append = async () => {
          throw new Error('Falha simulada ao gravar histórico');
        };

        provider.emitEvent({ type: 'status_changed', status: 'disconnected' });
        await Promise.resolve();
        await Promise.resolve();

        // O status atual (WhatsAppSession) continua sendo persistido
        // normalmente, mesmo com o histórico falhando — mesmo try/catch,
        // mesma política de "logar e seguir" já validada para repo.update().
        expect((await repo.findById(session.id))?.status).toBe('disconnected');
        expect(logger.calls.some((c) => c.level === 'error')).toBe(true);
      });
    });

    it('[BUG-01] não deve perder eventos emitidos pelo provider durante connect() (listener registrado tarde demais)', async () => {
      const { sessionManager, provider, logger } = buildSut();
      // Simula um provider que dispara connection.update de forma quase
      // síncrona, como parte da própria chamada de connect() — o cenário
      // real mais comum é o Baileys emitir o primeiro evento (QR, ou uma
      // reconexão instantânea com credenciais em cache) antes que qualquer
      // outra linha de código depois de `connect()` seja executada.
      provider.autoEmitOnConnect = {
        type: 'status_changed',
        status: 'connected',
        phoneNumber: '+5511777777777',
      };

      await sessionManager.init();
      // O handler assíncrono é disparado (fire-and-forget) de dentro de
      // connect(); dá espaço para a microtask dele resolver antes de checar
      // os logs (mesmo padrão já usado no teste de eventos assíncronos acima).
      await Promise.resolve();
      await Promise.resolve();

      // Esta asserção só pode ser verdadeira se o listener já existia
      // quando `connect()` emitiu o evento — ela prova que o handler
      // assíncrono (`subscribeToProviderEvents`) rodou de verdade, e não
      // apenas que o estado final "por acaso" bateu por outro caminho.
      const asyncUpdateLog = logger.calls.find(
        (c) => c.level === 'debug' && String(c.message).includes('Atualização assíncrona'),
      );
      expect(asyncUpdateLog).toBeDefined();
    });

    it('[P6] deve usar o id retornado pelo upsert atômico do repositório, não o UUID gerado especulativamente (evita duplicar sessão em corrida de init() concorrente)', async () => {
      const { sessionManager, repo } = buildSut();
      const winnerSession: WhatsAppSession = {
        id: 'winner-id-de-chamada-concorrente',
        tenantId: 'tenant-1',
        sessionName: 'default',
        provider: 'baileys',
        status: 'connecting',
        phoneNumber: undefined,
        connectedAt: undefined,
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // Simula outra chamada de init() (concorrente) que já venceu a
      // corrida no banco e inseriu a linha primeiro — o upsert atômico real
      // (Postgres ON CONFLICT) devolveria essa linha, nunca criaria uma
      // segunda nem lançaria uma exceção de violação de unicidade.
      repo.forcedUpsertResult = winnerSession;

      const result = await sessionManager.init();

      expect(result.id).toBe('winner-id-de-chamada-concorrente');
      const persisted = await repo.findById('winner-id-de-chamada-concorrente');
      expect(persisted).toBeDefined();
      // Nenhuma segunda linha deve ter sido criada com um id diferente.
      const all = await repo.findAllByTenant('tenant-1');
      expect(all).toHaveLength(1);
    });

    it('[BUG-01] onEvent() deve ser registrado no provider antes de connect() ser chamado', async () => {
      const { sessionManager, provider } = buildSut();
      let listenerAlreadyRegisteredDuringConnect = false;
      const originalConnect = provider.connect.bind(provider);
      provider.connect = async () => {
        listenerAlreadyRegisteredDuringConnect = provider.hasListener();
        return originalConnect();
      };

      await sessionManager.init();

      expect(listenerAlreadyRegisteredDuringConnect).toBe(true);
    });

    it('[ADR #29] duas chamadas concorrentes de init() na mesma instância resultam em uma única conexão (nunca duas)', async () => {
      const { sessionManager, provider } = buildSut();

      const [sessionA, sessionB] = await Promise.all([
        sessionManager.init(),
        sessionManager.init(),
      ]);

      // O mutex de ciclo de vida serializa as duas chamadas: a segunda só
      // roda depois que a primeira termina, e nesse ponto a lógica já
      // existente de "já conectado neste processo, reaproveitar" (BUG-02)
      // naturalmente evita um segundo connect() — sem precisar compartilhar
      // a mesma Promise entre as duas chamadas.
      expect(provider.connectCalls).toBe(1);
      expect(sessionA.id).toBe(sessionB.id);
    });
  });

  describe('disconnect', () => {
    it('deve chamar o provider e marcar a sessão como desconectada no repositório', async () => {
      const { sessionManager, provider, repo } = buildSut();
      const session = await sessionManager.init();

      await sessionManager.disconnect();

      expect(provider.disconnectCalls).toBe(1);
      const updated = await repo.findById(session.id);
      expect(updated?.status).toBe('disconnected');
    });

    it('deve ser idempotente: disconnect() numa sessão nunca inicializada (nem nesta instância, nem persistida) não lança, só não persiste nada', async () => {
      const { sessionManager, provider, repo } = buildSut();

      await expect(sessionManager.disconnect()).resolves.toBeUndefined();

      expect(provider.disconnectCalls).toBe(1);
      expect(await repo.findAllByTenant('tenant-1')).toHaveLength(0);
    });

    it('[ADR #29, F3] disconnect() aguarda um init() em andamento na mesma instância antes de rodar (evita socket criado depois do disconnect)', async () => {
      const { sessionManager, provider } = buildSut();
      let releaseConnect!: () => void;
      provider.connectGate = new Promise<void>((resolve) => {
        releaseConnect = resolve;
      });

      const initPromise = sessionManager.init();
      // disconnect() é chamado ENQUANTO init() ainda está preso em connect().
      const disconnectPromise = sessionManager.disconnect();

      // Nada deve ter progredido ainda — connect() está bloqueado no gate,
      // e o mutex de ciclo de vida deve estar segurando disconnect() atrás
      // dele, não deixando os dois rodarem fora de ordem.
      expect(provider.connectCalls).toBe(0);
      expect(provider.disconnectCalls).toBe(0);

      releaseConnect();
      await initPromise;
      await disconnectPromise;

      // connect() sempre termina (e é contado) ANTES de disconnect() rodar
      // — é exatamente essa ordem que fecha a race do achado F3 (ADR #29):
      // sem a serialização, disconnect() podia rodar teardownSocket() antes
      // do socket novo existir, e connect() criava o socket DEPOIS.
      expect(provider.connectCalls).toBe(1);
      expect(provider.disconnectCalls).toBe(1);
    });
  });

  describe('getStatus', () => {
    it('deve lançar WhatsAppSessionNotFoundError quando a sessão nunca foi inicializada nem existe no repositório', async () => {
      const { sessionManager } = buildSut();

      await expect(sessionManager.getStatus()).rejects.toThrow(WhatsAppSessionNotFoundError);
    });

    it('deve retornar a sessão combinada com o status atual do provider', async () => {
      const { sessionManager, provider } = buildSut();
      const session = await sessionManager.init();
      provider.status = 'disconnected';

      const status = await sessionManager.getStatus();

      expect(status.id).toBe(session.id);
      expect(status.status).toBe('disconnected');
    });

    it('deve resolver via repositório quando a sessão existe mas nunca foi inicializada NESTA instância (ex.: após restart do processo) — e nunca chama connect()', async () => {
      const { sessionManager, provider, repo } = buildSut();
      repo.seed({
        id: 'existing-id',
        tenantId: 'tenant-1',
        sessionName: 'default',
        provider: 'baileys',
        status: 'connected',
        connectedAt: new Date(),
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // provider "honesto": recém-criado, nunca conectado neste processo.
      expect(provider.status).toBe('disconnected');

      const status = await sessionManager.getStatus();

      expect(status.id).toBe('existing-id');
      expect(status.status).toBe('disconnected'); // reflete o provider ao vivo, não o banco (BUG-02)
      expect(provider.connectCalls).toBe(0); // getStatus() NUNCA conecta
    });

    it('[ADR #29, F5] getStatus() não fica bloqueado por um init() em andamento na mesma instância (leitura livre, fora do lock de ciclo de vida)', async () => {
      const { sessionManager, provider } = buildSut();
      let releaseConnect!: () => void;
      provider.connectGate = new Promise<void>((resolve) => {
        releaseConnect = resolve;
      });

      const initPromise = sessionManager.init();

      // Dá espaço para doInit() progredir (findByTenantAndSessionName +
      // upsertByTenantAndSessionName, cada um com seu próprio await) até o
      // ponto em que já persistiu o registro inicial e chamou connect() —
      // que fica preso no gate indefinidamente até releaseConnect(). Como o
      // gate NUNCA libera sozinho, não há risco de "adiantar" demais aqui;
      // várias voltas de microtask apenas garantem que doInit() já passou
      // dos awaits anteriores a connect(). Mesmo padrão (aguardar
      // microtasks) já usado no restante deste arquivo para handlers
      // assíncronos, só que com mais voltas porque a cadeia até connect()
      // tem mais awaits no meio.
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }

      // getStatus() deve resolver mesmo com init() ainda preso em connect() —
      // o registro já foi upsertado (status 'connecting') antes de connect()
      // ser chamado (ver doInit()), mas o status retornado reflete o
      // provider AO VIVO (ainda 'disconnected', porque connect() está
      // travado no gate), não o valor 'connecting' persistido no banco.
      const statusDuringInit = await sessionManager.getStatus();
      expect(statusDuringInit.status).toBe('disconnected');

      releaseConnect();
      await initPromise;
    });
  });

  describe('getQRCode', () => {
    it('deve delegar ao provider', async () => {
      const { sessionManager, provider } = buildSut();
      provider.qrCode = 'outro-qr-code';

      const qrCode = await sessionManager.getQRCode();

      expect(qrCode).toBe('outro-qr-code');
    });
  });

  describe('sendMessage (Milestone 3, Bloco 4)', () => {
    it('deve delegar to/content diretamente ao provider', async () => {
      const { sessionManager, provider } = buildSut();

      await sessionManager.sendMessage('5511999999999@s.whatsapp.net', 'Olá!');

      expect(provider.sendMessageCalls).toEqual([
        { to: '5511999999999@s.whatsapp.net', content: 'Olá!' },
      ]);
    });

    it('deve propagar um erro do provider (ex.: WhatsAppNotConnectedError), não engolir', async () => {
      const { sessionManager, provider } = buildSut();
      provider.nextSendMessageError = new Error('Falha simulada de envio');

      await expect(
        sessionManager.sendMessage('5511999999999@s.whatsapp.net', 'Olá!'),
      ).rejects.toThrow('Falha simulada de envio');
    });

    it('não passa pelo lifecycleLock — pode ser chamado mesmo com init() em andamento', async () => {
      const { sessionManager, provider } = buildSut();
      provider.connectGate = new Promise(() => {
        // nunca resolve nesta chamada — connect() fica pendurado propositalmente
      });
      const initPromise = sessionManager.init();

      await sessionManager.sendMessage('5511999999999@s.whatsapp.net', 'Olá durante init()');

      expect(provider.sendMessageCalls).toEqual([
        { to: '5511999999999@s.whatsapp.net', content: 'Olá durante init()' },
      ]);
      void initPromise; // não aguardado deliberadamente: connect() nunca resolve neste teste
    });
  });

  describe('sendMediaMessage (Fase 1, Bloco F1.3)', () => {
    const MEDIA = {
      contentType: 'image' as const,
      buffer: Buffer.from('bytes'),
      mimeType: 'image/jpeg',
      caption: 'legenda',
    };

    it('deve delegar to/media diretamente ao provider', async () => {
      const { sessionManager, provider } = buildSut();

      await sessionManager.sendMediaMessage('5511999999999@s.whatsapp.net', MEDIA);

      expect(provider.sendMediaMessageCalls).toEqual([
        { to: '5511999999999@s.whatsapp.net', media: MEDIA },
      ]);
    });

    it('deve propagar um erro do provider (ex.: WhatsAppNotConnectedError), não engolir', async () => {
      const { sessionManager, provider } = buildSut();
      provider.nextSendMediaMessageError = new Error('Falha simulada de envio de mídia');

      await expect(
        sessionManager.sendMediaMessage('5511999999999@s.whatsapp.net', MEDIA),
      ).rejects.toThrow('Falha simulada de envio de mídia');
    });

    it('não passa pelo lifecycleLock — pode ser chamado mesmo com init() em andamento', async () => {
      const { sessionManager, provider } = buildSut();
      provider.connectGate = new Promise(() => {
        // nunca resolve nesta chamada — connect() fica pendurado propositalmente
      });
      const initPromise = sessionManager.init();

      await sessionManager.sendMediaMessage('5511999999999@s.whatsapp.net', MEDIA);

      expect(provider.sendMediaMessageCalls).toEqual([
        { to: '5511999999999@s.whatsapp.net', media: MEDIA },
      ]);
      void initPromise; // não aguardado deliberadamente: connect() nunca resolve neste teste
    });
  });

  describe('logging (M1A.1)', () => {
    it('deve logar debug ao iniciar e info ao concluir a conexão de uma nova sessão', async () => {
      const { sessionManager, logger } = buildSut();

      const session = await sessionManager.init();

      const debugCall = logger.calls.find((c) => c.level === 'debug');
      expect(debugCall?.meta).toMatchObject({ tenantId: 'tenant-1', sessionName: 'default' });

      const infoCall = logger.calls.find((c) => c.level === 'info');
      expect(infoCall?.meta).toMatchObject({
        tenantId: 'tenant-1',
        sessionName: 'default',
        sessionId: session.id,
        status: 'connected',
        reused: false,
      });
    });

    it('deve logar info específico ao reaproveitar sessão já ativa neste processo, sem tentar reconectar', async () => {
      const { sessionManager, provider, repo, logger } = buildSut();
      repo.seed({
        id: 'existing-id',
        tenantId: 'tenant-1',
        sessionName: 'default',
        provider: 'baileys',
        status: 'connected',
        connectedAt: new Date(),
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      provider.status = 'connected'; // socket já vivo neste processo

      await sessionManager.init();

      const reuseLog = logger.calls.find(
        (c) => c.level === 'info' && String(c.message).includes('reaproveitando'),
      );
      expect(reuseLog?.meta).toMatchObject({
        tenantId: 'tenant-1',
        sessionName: 'default',
        sessionId: 'existing-id',
      });
    });

    it('deve logar info ao desconectar', async () => {
      const { sessionManager, logger } = buildSut();
      const session = await sessionManager.init();
      logger.calls = [];

      await sessionManager.disconnect();

      const disconnectLog = logger.calls.find((c) => c.level === 'info');
      expect(disconnectLog?.meta).toMatchObject({ sessionId: session.id });
    });

    it('deve logar warn ao consultar status de sessão inexistente, antes de lançar o erro', async () => {
      const { sessionManager, logger } = buildSut();

      await expect(sessionManager.getStatus()).rejects.toThrow(WhatsAppSessionNotFoundError);

      const warnLog = logger.calls.find((c) => c.level === 'warn');
      expect(warnLog?.meta).toMatchObject({ tenantId: 'tenant-1', sessionName: 'default' });
    });

    it('deve logar error (sem lançar exceção não tratada) quando a persistência de uma atualização assíncrona falhar', async () => {
      const { sessionManager, provider, repo, logger } = buildSut();
      await sessionManager.init();
      repo.failNextUpdate = true;

      expect(() =>
        provider.emitEvent({ type: 'status_changed', status: 'disconnected' }),
      ).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();

      const errorLog = logger.calls.find((c) => c.level === 'error');
      expect(errorLog?.meta?.error).toBeInstanceOf(Error);
    });
  });

  describe('generation (Production Hardening, Bloco 4)', () => {
    it('começa em 0 antes de qualquer init()', () => {
      const { sessionManager } = buildSut();

      expect(sessionManager.getGeneration()).toBe(0);
    });

    it('incrementa quando o provider emite status_changed com status "connecting"', async () => {
      const { sessionManager, provider } = buildSut();
      await sessionManager.init();
      expect(sessionManager.getGeneration()).toBe(0); // init() não emite 'connecting' sozinho neste Fake

      provider.emitEvent({ type: 'status_changed', status: 'connecting' });

      expect(sessionManager.getGeneration()).toBe(1);
    });

    it('NÃO incrementa para outras transições de status (connected, disconnected)', async () => {
      const { sessionManager, provider } = buildSut();
      await sessionManager.init();

      provider.emitEvent({ type: 'status_changed', status: 'connected' });
      provider.emitEvent({ type: 'status_changed', status: 'disconnected' });

      expect(sessionManager.getGeneration()).toBe(0);
    });

    it('NÃO incrementa em leituras puras (getStatus/getQRCode) — evita impedir evicção legítima sob polling intenso', async () => {
      const { sessionManager } = buildSut();
      await sessionManager.init();

      await sessionManager.getStatus();
      await sessionManager.getStatus();
      await sessionManager.getQRCode();

      expect(sessionManager.getGeneration()).toBe(0);
    });

    it('incrementa a cada nova transição para "connecting", simulando múltiplas reconexões (inclui a reconexão automática interna do Baileys após 515 — mesmo evento, origem irrelevante para o SessionManager)', async () => {
      const { sessionManager, provider } = buildSut();
      await sessionManager.init();

      provider.emitEvent({ type: 'status_changed', status: 'connecting' });
      provider.emitEvent({ type: 'status_changed', status: 'connected' });
      provider.emitEvent({ type: 'status_changed', status: 'connecting' }); // 2ª reconexão, ex.: pós-515

      expect(sessionManager.getGeneration()).toBe(2);
    });
  });

  describe('message_received (Milestone 3, Bloco 1 — MessageReceivedHandler opcional)', () => {
    it('repassa o evento message_received ao handler configurado, com tenantId/sessionName vindos da própria instância', async () => {
      const handler = new FakeMessageReceivedHandler();
      const { sessionManager, provider } = buildSut('tenant-1', 'default', handler);
      await sessionManager.init();

      const receivedAt = new Date('2026-07-09T12:00:00Z');
      provider.emitEvent({
        type: 'message_received',
        from: '5511999999999@s.whatsapp.net',
        content: 'Olá!',
        receivedAt,
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(handler.getAll()).toEqual([
        {
          tenantId: 'tenant-1',
          sessionName: 'default',
          from: '5511999999999@s.whatsapp.net',
          content: 'Olá!',
          receivedAt,
        },
      ]);
    });

    it('sem handler configurado, message_received é ignorado sem lançar e sem afetar o processamento de status_changed', async () => {
      const { sessionManager, provider, repo } = buildSut();
      const session = await sessionManager.init();

      expect(() =>
        provider.emitEvent({
          type: 'message_received',
          from: 'x@s.whatsapp.net',
          content: 'oi',
          receivedAt: new Date(),
        }),
      ).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();

      provider.emitEvent({ type: 'status_changed', status: 'disconnected' });
      await Promise.resolve();
      await Promise.resolve();

      const updated = await repo.findById(session.id);
      expect(updated?.status).toBe('disconnected');
    });

    it('não incrementa a geração (generation) — message_received não é uma reconexão', async () => {
      const handler = new FakeMessageReceivedHandler();
      const { sessionManager, provider } = buildSut('tenant-1', 'default', handler);
      await sessionManager.init();

      provider.emitEvent({
        type: 'message_received',
        from: 'x@s.whatsapp.net',
        content: 'oi',
        receivedAt: new Date(),
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(sessionManager.getGeneration()).toBe(0);
    });

    it('falha do handler é logada, não lançada (mesma política de tolerância já usada para eventRepository.append)', async () => {
      const handler = new FakeMessageReceivedHandler();
      handler.failNextHandle = true;
      const { sessionManager, provider, logger } = buildSut('tenant-1', 'default', handler);
      await sessionManager.init();

      expect(() =>
        provider.emitEvent({
          type: 'message_received',
          from: 'x@s.whatsapp.net',
          content: 'oi',
          receivedAt: new Date(),
        }),
      ).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();

      const errorLog = logger.calls.find((c) => c.level === 'error');
      expect(errorLog?.meta?.error).toBeInstanceOf(Error);
      expect(handler.getAll()).toHaveLength(0);
    });
  });
});
