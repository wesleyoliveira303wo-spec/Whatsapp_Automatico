import { Logger } from '../../../../src/shared/domain/Logger';
import { CredentialsStore } from '../../../../src/shared/security/domain/CredentialsStore';
import { Cipher } from '../../../../src/shared/security/domain/Cipher';
import {
  WhatsAppProviderEvent,
  WhatsAppMediaReferenceEvent,
} from '../../../../src/services/whatsapp/domain/providers/WhatsAppProviderEvent';
import { WhatsAppQRCodeNotAvailableError } from '../../../../src/services/whatsapp/domain/errors/WhatsAppQRCodeNotAvailableError';
import { WhatsAppNotConnectedError } from '../../../../src/services/whatsapp/domain/errors/WhatsAppNotConnectedError';
import { FakeReconnectionPolicy } from './FakeReconnectionPolicy';

type EventHandler = (...args: unknown[]) => void;

interface FakeSocket {
  ev: { on: jest.Mock; handlers: Record<string, EventHandler> };
  end: jest.Mock;
  sendMessage: jest.Mock;
  /** Milestone 6, Bloco M6H-2b — `sock.profilePictureUrl(jid, 'image')`. */
  profilePictureUrl: jest.Mock;
  user: { id: string } | undefined;
}

/**
 * Cada chamada de `makeWASocket()` retorna um objeto de socket NOVO e
 * distinto (nunca o mesmo objeto reutilizado) — necessário para testar de
 * verdade o BUG-04 (auditoria de 2026-07-06, ver DECISIONS.md ADR #23): sem
 * sockets distintos por chamada, não é possível provar que o socket ANTIGO
 * foi encerrado nem que seus eventos tardios são ignorados depois que um
 * socket novo os substitui.
 */
const createdSockets: FakeSocket[] = [];
function createFakeSocket(): FakeSocket {
  const handlers: Record<string, EventHandler> = {};
  const socket: FakeSocket = {
    ev: {
      on: jest.fn((event: string, handler: EventHandler) => {
        handlers[event] = handler;
      }),
      handlers,
    },
    end: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    profilePictureUrl: jest.fn().mockResolvedValue('https://pps.whatsapp.net/fake-avatar.jpg'),
    user: { id: '5511999999999:1@s.whatsapp.net' },
  };
  createdSockets.push(socket);
  return socket;
}

const mockMakeWASocket = jest.fn(() => createFakeSocket());

/**
 * Mock "virtual" de `@whiskeysockets/baileys` — o pacote real não está
 * instalado neste sandbox (ver nota de verificação em `BaileysProvider.ts`).
 * `{ virtual: true }` permite simular o módulo sem ele existir em disco.
 * Cobre só o shape usado por `BaileysProvider.ts`/`BaileysCredentialsAdapter.ts`.
 */
jest.mock(
  '@whiskeysockets/baileys',
  () => ({
    __esModule: true,
    default: (...args: unknown[]) => mockMakeWASocket(...args),
    // `connectionLost: 408` (Production Hardening, Bloco 8a) — mesmo valor
    // numérico de `timedOut` na biblioteca real (ver
    // node_modules/@whiskeysockets/baileys/lib/Types/index.d.ts), por isso
    // só `connectionLost` é necessário aqui para os testes de mapeamento.
    DisconnectReason: { loggedOut: 401, restartRequired: 515, connectionLost: 408 },
    BufferJSON: {
      replacer: (_key: string, value: unknown) => value,
      reviver: (_key: string, value: unknown) => value,
    },
    initAuthCreds: () => ({}),
    // Adicionado junto com o fix de versão do protocolo (achado no teste
    // manual real, ver DECISIONS.md) — sem isto, `connect()` chamaria uma
    // função inexistente no mock e todo teste que exercita `connect()`
    // quebraria.
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1023223821], isLatest: true }),
    // Fix de endereçamento LID (achado do teste real com número novo): o
    // provider passou a normalizar o JID de resposta. Mock minimalista que
    // reproduz o essencial do `jidNormalizedUser` real (tira sufixo de
    // device/agente `user:device` / `user_agent`, preserva `user@server`).
    jidNormalizedUser: (jid: string) => {
      const [user, server] = jid.split('@');
      return `${user.split(':')[0].split('_')[0]}@${server}`;
    },
  }),
  { virtual: true },
);

import {
  BaileysProvider,
  buildBaileysMediaContent,
} from '../../../../src/services/whatsapp/infrastructure/providers/baileys/BaileysProvider';

function createFakeCredentialsStore(): CredentialsStore {
  const data = new Map<string, string>();
  return {
    get: async (_t, _n, key) => data.get(key) ?? null,
    getAll: async () => Object.fromEntries(data.entries()),
    set: async (_t, _n, key, value) => {
      data.set(key, value);
    },
    remove: async (_t, _n, key) => {
      data.delete(key);
    },
    clear: async () => data.clear(),
  };
}

/**
 * Fase 1, Bloco F1.1 (ADR #90) — cifra determinística e reversível o
 * suficiente para os testes provarem que a `mediaKey` NUNCA sai desta
 * classe em texto plano (prefixo `enc:` + a própria entrada), sem precisar
 * da implementação real (`AesGcmCipher`, que exige uma chave mestra).
 */
function createFakeCipher(): Cipher {
  return {
    encrypt: (_tenantId: string, plainText: string) => `enc:${plainText}`,
    decrypt: (_tenantId: string, cipherText: string) => cipherText.replace(/^enc:/, ''),
  };
}

function createFakeLogger(): Logger & {
  calls: { level: string; message: string; meta?: Record<string, unknown> }[];
} {
  const calls: { level: string; message: string; meta?: Record<string, unknown> }[] = [];
  const logger = {
    calls,
    debug: (message: string, meta?: Record<string, unknown>) =>
      calls.push({ level: 'debug', message, meta }),
    info: (message: string, meta?: Record<string, unknown>) =>
      calls.push({ level: 'info', message, meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      calls.push({ level: 'warn', message, meta }),
    error: (message: string, meta?: Record<string, unknown>) =>
      calls.push({ level: 'error', message, meta }),
    child: () => logger,
  };
  return logger;
}

describe('BaileysProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createdSockets.length = 0;
  });

  it('connect() deve criar o socket com auth state derivado do CredentialsStore e status "connecting"', async () => {
    const provider = new BaileysProvider(
      'tenant-1',
      'default',
      createFakeCredentialsStore(),
      createFakeLogger(),
      new FakeReconnectionPolicy(),
    );

    await provider.connect();

    expect(mockMakeWASocket).toHaveBeenCalledTimes(1);
    expect(await provider.getStatus()).toBe('connecting');
    expect(createdSockets[0].ev.handlers['creds.update']).toBeDefined();
    expect(createdSockets[0].ev.handlers['connection.update']).toBeDefined();
  });

  it('deve expor o QR Code recebido via connection.update', async () => {
    const provider = new BaileysProvider(
      'tenant-1',
      'default',
      createFakeCredentialsStore(),
      createFakeLogger(),
      new FakeReconnectionPolicy(),
    );
    await provider.connect();

    createdSockets[0].ev.handlers['connection.update']({ qr: 'qr-code-fake' });

    expect(await provider.getQRCode()).toBe('qr-code-fake');
  });

  it('getQRCode() deve rejeitar com WhatsAppQRCodeNotAvailableError (BUG-07) antes de qualquer QR ter sido recebido', async () => {
    // Verifica o tipo do erro, não o texto da mensagem (Item 5, Bloco 4):
    // a Presentation (Bloco 7) precisa mapear este erro por classe, então é
    // isso que a suite deve travar — a string é só um detalhe de log/debug.
    const provider = new BaileysProvider(
      'tenant-1',
      'default',
      createFakeCredentialsStore(),
      createFakeLogger(),
      new FakeReconnectionPolicy(),
    );
    await provider.connect();

    await expect(provider.getQRCode()).rejects.toBeInstanceOf(WhatsAppQRCodeNotAvailableError);
  });

  it('connection "open" deve marcar status "connected", extrair o telefone e emitir status_changed', async () => {
    const logger = createFakeLogger();
    const provider = new BaileysProvider(
      'tenant-1',
      'default',
      createFakeCredentialsStore(),
      logger,
      new FakeReconnectionPolicy(),
    );
    await provider.connect();

    const events: WhatsAppProviderEvent[] = [];
    provider.onEvent((event) => events.push(event));

    createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });

    expect(await provider.getStatus()).toBe('connected');
    expect(await provider.getPhoneNumber()).toBe('5511999999999');
    expect(events).toEqual([
      { type: 'status_changed', status: 'connected', phoneNumber: '5511999999999' },
    ]);
    expect(logger.calls.some((c) => c.level === 'info')).toBe(true);
  });

  it('connection "close" deve marcar status "disconnected", logar o motivo e emitir status_changed', async () => {
    const logger = createFakeLogger();
    const provider = new BaileysProvider(
      'tenant-1',
      'default',
      createFakeCredentialsStore(),
      logger,
      new FakeReconnectionPolicy(),
    );
    await provider.connect();

    const events: WhatsAppProviderEvent[] = [];
    provider.onEvent((event) => events.push(event));

    createdSockets[0].ev.handlers['connection.update']({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    });

    expect(await provider.getStatus()).toBe('disconnected');
    expect(events).toEqual([
      {
        type: 'status_changed',
        status: 'disconnected',
        phoneNumber: undefined,
        disconnectReason: 'logged_out',
      },
    ]);
    const warnCall = logger.calls.find((c) => c.level === 'warn');
    expect(warnCall?.meta).toMatchObject({ statusCode: 401, loggedOut: true });
  });

  describe('Production Hardening, Bloco 8a — mapeamento e limpeza de disconnectReason', () => {
    it('statusCode 515 (restartRequired) deve emitir disconnectReason "restart_required"', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 515 } } },
      });

      expect(events[0]).toMatchObject({
        status: 'disconnected',
        disconnectReason: 'restart_required',
      });
    });

    it('statusCode 408 (connectionLost, mesmo valor numérico de timedOut na biblioteca real) deve emitir disconnectReason "connection_lost"', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 408 } } },
      });

      expect(events[0]).toMatchObject({
        status: 'disconnected',
        disconnectReason: 'connection_lost',
      });
    });

    it('statusCode não mapeado (ex.: badSession = 500) deve emitir disconnectReason "unknown", nunca lançar', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 500 } } },
      });

      expect(events[0]).toMatchObject({ status: 'disconnected', disconnectReason: 'unknown' });
    });

    it('ausência de statusCode (ex.: close sem lastDisconnect) deve emitir disconnectReason "unknown"', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['connection.update']({ connection: 'close' });

      expect(events[0]).toMatchObject({ status: 'disconnected', disconnectReason: 'unknown' });
    });

    it('connection "connecting" (mesmo socket) deve limpar o disconnectReason de uma queda anterior', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 401 } } },
      });

      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));
      createdSockets[0].ev.handlers['connection.update']({ connection: 'connecting' });

      expect(events).toEqual([
        {
          type: 'status_changed',
          status: 'connecting',
          phoneNumber: undefined,
          disconnectReason: undefined,
        },
      ]);
    });

    it('connection "open" deve limpar o disconnectReason de uma queda anterior', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 401 } } },
      });

      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));
      createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });

      expect(events[0].disconnectReason).toBeUndefined();
    });

    it('reconexão (via ReconnectionPolicy) após restartRequired deve limpar o disconnectReason no socket novo', async () => {
      const reconnectionPolicy = new FakeReconnectionPolicy();
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        reconnectionPolicy,
      );
      await provider.connect();

      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 515 } } },
      });

      // Simula o timer da política disparando (Production Hardening, Bloco 8b) —
      // ver `BaileysProvider.test.ts`/`WhatsAppReconnectionPolicy.test.ts` para
      // a divisão de responsabilidades: aqui só provamos que BaileysProvider
      // reage corretamente ao `onRetry`, não a matemática do backoff.
      reconnectionPolicy.fireLastRetry();
      // Flush robusto de microtasks: o connect() de reconexão agora tem alguns
      // `await` a mais (import dinâmico do Baileys ESM na v7). Em vez de contar
      // hops exatos, drenamos a fila de microtasks até o socket novo surgir.
      for (let i = 0; i < 20; i += 1) await Promise.resolve();

      expect(createdSockets).toHaveLength(2);

      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));
      createdSockets[1].ev.handlers['connection.update']({ connection: 'open' });

      expect(events[0]).toMatchObject({ status: 'connected' });
      expect(events[0].disconnectReason).toBeUndefined();
    });
  });

  it('disconnect() deve encerrar o socket e marcar status "disconnected"', async () => {
    const provider = new BaileysProvider(
      'tenant-1',
      'default',
      createFakeCredentialsStore(),
      createFakeLogger(),
      new FakeReconnectionPolicy(),
    );
    await provider.connect();

    await provider.disconnect();

    expect(createdSockets[0].end).toHaveBeenCalledTimes(1);
    expect(await provider.getStatus()).toBe('disconnected');
  });

  it('creds.update deve persistir as credenciais via CredentialsStore (saveCreds)', async () => {
    const credentialsStore = createFakeCredentialsStore();
    const setSpy = jest.spyOn(credentialsStore, 'set');
    const provider = new BaileysProvider(
      'tenant-1',
      'default',
      credentialsStore,
      createFakeLogger(),
      new FakeReconnectionPolicy(),
    );

    await provider.connect();
    await createdSockets[0].ev.handlers['creds.update']();

    expect(setSpy).toHaveBeenCalledWith(
      'tenant-1',
      'whatsapp:session:default',
      'creds',
      expect.any(String),
    );
  });

  describe('BUG-12 — creds.update de um socket já substituído deve ser ignorado', () => {
    it('creds.update de um socket antigo (substituído por reconexão) não deve persistir credenciais', async () => {
      const credentialsStore = createFakeCredentialsStore();
      const setSpy = jest.spyOn(credentialsStore, 'set');
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        credentialsStore,
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );

      await provider.connect();
      const firstSocketCredsHandler = createdSockets[0].ev.handlers['creds.update'];
      await provider.connect(); // reconecta — encerra o socket antigo, cria um novo
      setSpy.mockClear();

      // Socket antigo dispara um creds.update tardio (ex.: flush ao encerrar
      // a conexão) — deve ser ignorado, não pode sobrescrever a chave
      // 'creds' com dados do socket que não existe mais.
      firstSocketCredsHandler();
      await Promise.resolve();
      await Promise.resolve();

      expect(setSpy).not.toHaveBeenCalled();
    });

    it('creds.update do socket ATUAL continua persistindo normalmente após uma reconexão', async () => {
      const credentialsStore = createFakeCredentialsStore();
      const setSpy = jest.spyOn(credentialsStore, 'set');
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        credentialsStore,
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );

      await provider.connect();
      await provider.connect();
      setSpy.mockClear();

      createdSockets[1].ev.handlers['creds.update']();
      await Promise.resolve();
      await Promise.resolve();

      expect(setSpy).toHaveBeenCalledWith(
        'tenant-1',
        'whatsapp:session:default',
        'creds',
        expect.any(String),
      );
    });

    it('falha ao persistir credenciais (creds.update) deve ser logada, não lançar uma unhandled rejection', async () => {
      const credentialsStore = createFakeCredentialsStore();
      jest.spyOn(credentialsStore, 'set').mockRejectedValue(new Error('falha simulada de banco'));
      const logger = createFakeLogger();
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        credentialsStore,
        logger,
        new FakeReconnectionPolicy(),
      );

      await provider.connect();
      expect(() => createdSockets[0].ev.handlers['creds.update']()).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();

      const errorLog = logger.calls.find((c) => c.level === 'error');
      expect(errorLog?.meta?.error).toBeInstanceOf(Error);
    });
  });

  describe('BUG-14 (achado em teste manual real, 2026-07-08) — generalizado na Production Hardening, Bloco 8b: reconexão via ReconnectionPolicy', () => {
    it('connection "close" com statusCode 515 (restartRequired) delega ao reconnectionPolicy.scheduleReconnect com o motivo "restart_required"', async () => {
      const reconnectionPolicy = new FakeReconnectionPolicy();
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        reconnectionPolicy,
      );
      await provider.connect();

      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 515 } } },
      });

      expect(reconnectionPolicy.scheduleCalls).toHaveLength(1);
      expect(reconnectionPolicy.scheduleCalls[0].reason).toBe('restart_required');
    });

    it('quando a política decide tentar (onRetry disparado), connect() é chamado de novo — fecha o pareamento (515), mesmo comportamento observável do BUG-14 original', async () => {
      const reconnectionPolicy = new FakeReconnectionPolicy();
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        reconnectionPolicy,
      );
      await provider.connect();
      expect(mockMakeWASocket).toHaveBeenCalledTimes(1);

      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 515 } } },
      });
      reconnectionPolicy.fireLastRetry();
      // Flush robusto de microtasks: o connect() de reconexão agora tem alguns
      // `await` a mais (import dinâmico do Baileys ESM na v7). Em vez de contar
      // hops exatos, drenamos a fila de microtasks até o socket novo surgir.
      for (let i = 0; i < 20; i += 1) await Promise.resolve();

      // Sem isto, o pareamento (QR) nunca se completa do lado do WhatsApp —
      // é exatamente o bug encontrado no teste manual real: o celular
      // reportava "não foi possível conectar" mesmo com as credenciais já
      // salvas, porque faltava esta segunda metade do handshake.
      expect(mockMakeWASocket).toHaveBeenCalledTimes(2);
    });

    it('[generalização do Bloco 8b] connection "close" com outro statusCode recuperável (500, "unknown") também delega ao reconnectionPolicy — não é mais um caso "nunca reconecta"', async () => {
      const reconnectionPolicy = new FakeReconnectionPolicy();
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        reconnectionPolicy,
      );
      await provider.connect();

      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 500 } } },
      });

      expect(reconnectionPolicy.scheduleCalls).toHaveLength(1);
      expect(reconnectionPolicy.scheduleCalls[0].reason).toBe('unknown');
      // A DECISÃO de tentar (e quando) é da política, não deste provider —
      // sem disparar `fireLastRetry()`, nenhuma nova conexão acontece ainda.
      expect(mockMakeWASocket).toHaveBeenCalledTimes(1);
    });

    it('connection "close" com loggedOut NÃO delega ao reconnectionPolicy.scheduleReconnect (motivo definitivo — ver isDisconnectReasonRecoverable)', async () => {
      const reconnectionPolicy = new FakeReconnectionPolicy();
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        reconnectionPolicy,
      );
      await provider.connect();

      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 401 } } },
      });

      // BaileysProvider sempre CHAMA scheduleReconnect (é a própria política
      // quem decide não agendar nada para logged_out — ver
      // `WhatsAppReconnectionPolicy.test.ts`); o que este teste garante é que
      // o motivo passado adiante é o correto para essa decisão ser possível.
      expect(reconnectionPolicy.scheduleCalls).toHaveLength(1);
      expect(reconnectionPolicy.scheduleCalls[0].reason).toBe('logged_out');
    });
  });

  describe('Production Hardening, Bloco 8b — reset()/cancelPending() do reconnectionPolicy', () => {
    it('connection "open" chama reconnectionPolicy.reset() (conexão bem-sucedida fecha o circuito/zera falhas)', async () => {
      const reconnectionPolicy = new FakeReconnectionPolicy();
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        reconnectionPolicy,
      );
      await provider.connect();

      createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });

      expect(reconnectionPolicy.resetCallCount).toBe(1);
    });

    it('disconnect() explícito chama reconnectionPolicy.cancelPending() (evita reconexão automática indesejada depois de um pedido explícito)', async () => {
      const reconnectionPolicy = new FakeReconnectionPolicy();
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        reconnectionPolicy,
      );
      await provider.connect();

      await provider.disconnect();

      expect(reconnectionPolicy.cancelPendingCallCount).toBeGreaterThanOrEqual(1);
    });

    it('connect() (reconexão explícita ou automática) chama reconnectionPolicy.cancelPending() antes de conectar', async () => {
      const reconnectionPolicy = new FakeReconnectionPolicy();
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        reconnectionPolicy,
      );

      await provider.connect();

      expect(reconnectionPolicy.cancelPendingCallCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('BUG-13 — limpeza de credenciais ao detectar logout (DisconnectReason.loggedOut)', () => {
    it('connection "close" com loggedOut=true deve limpar as credenciais do namespace da sessão', async () => {
      const credentialsStore = createFakeCredentialsStore();
      const clearSpy = jest.spyOn(credentialsStore, 'clear');
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        credentialsStore,
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();

      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 401 } } }, // 401 == DisconnectReason.loggedOut no mock
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(clearSpy).toHaveBeenCalledWith('tenant-1', 'whatsapp:session:default');
    });

    it('connection "close" sem loggedOut (queda comum) NÃO deve limpar as credenciais', async () => {
      const credentialsStore = createFakeCredentialsStore();
      const clearSpy = jest.spyOn(credentialsStore, 'clear');
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        credentialsStore,
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();

      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 500 } } },
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(clearSpy).not.toHaveBeenCalled();
    });

    it('falha ao limpar credenciais após logout deve ser logada, não lançar', async () => {
      const credentialsStore = createFakeCredentialsStore();
      jest.spyOn(credentialsStore, 'clear').mockRejectedValue(new Error('falha simulada'));
      const logger = createFakeLogger();
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        credentialsStore,
        logger,
        new FakeReconnectionPolicy(),
      );
      await provider.connect();

      expect(() =>
        createdSockets[0].ev.handlers['connection.update']({
          connection: 'close',
          lastDisconnect: { error: { output: { statusCode: 401 } } },
        }),
      ).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();

      const errorLog = logger.calls.find(
        (c) => c.level === 'error' && String(c.message).includes('limpar credenciais'),
      );
      expect(errorLog).toBeDefined();
    });
  });

  describe('BUG-04 — ciclo de vida do socket em reconexões', () => {
    it('connect() chamado de novo na mesma instância deve encerrar o socket anterior (evita socket zumbi)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );

      await provider.connect();
      const firstSocket = createdSockets[0];
      await provider.connect();

      expect(createdSockets).toHaveLength(2);
      expect(firstSocket.end).toHaveBeenCalledTimes(1);
    });

    it('eventos de um socket já substituído devem ser ignorados (evita "status flapping" entre sockets concorrentes)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );

      await provider.connect();
      const firstSocket = createdSockets[0];
      await provider.connect();
      const secondSocket = createdSockets[1];

      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      // Socket novo (atual) reporta conectado.
      secondSocket.ev.handlers['connection.update']({ connection: 'open' });
      expect(await provider.getStatus()).toBe('connected');

      // Socket antigo, já substituído, dispara um evento tardio de queda —
      // deve ser ignorado, não pode sobrescrever o estado do socket atual.
      firstSocket.ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 500 } } },
      });

      expect(await provider.getStatus()).toBe('connected');
      expect(events).toEqual([
        { type: 'status_changed', status: 'connected', phoneNumber: '5511999999999' },
      ]);
    });

    it('disconnect() seguido de connect() deve funcionar normalmente com um socket novo e limpo', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );

      await provider.connect();
      const firstSocket = createdSockets[0];
      await provider.disconnect();
      await provider.connect();
      const secondSocket = createdSockets[1];

      expect(firstSocket.end).toHaveBeenCalledTimes(1);
      expect(createdSockets).toHaveLength(2);

      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));
      secondSocket.ev.handlers['connection.update']({ connection: 'open' });

      expect(await provider.getStatus()).toBe('connected');
      expect(events).toHaveLength(1);
    });

    it('encerrar múltiplas vezes seguidas não deve lançar (idempotência do teardown)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();

      await expect(provider.disconnect()).resolves.not.toThrow();
      await expect(provider.disconnect()).resolves.not.toThrow();
    });
  });

  describe('sendMessage() — Milestone 3, Bloco 1 (ajuste de auditoria: exige socket presente E currentStatus === "connected")', () => {
    it('envia a mensagem via socket.sendMessage() quando a sessão está de fato conectada', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });

      await provider.sendMessage('5511888888888@s.whatsapp.net', 'Olá, tudo bem?');

      expect(createdSockets[0].sendMessage).toHaveBeenCalledWith('5511888888888@s.whatsapp.net', {
        text: 'Olá, tudo bem?',
      });
    });

    it('lança WhatsAppNotConnectedError quando nunca houve connect() (nenhum socket)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );

      await expect(
        provider.sendMessage('5511888888888@s.whatsapp.net', 'oi'),
      ).rejects.toBeInstanceOf(WhatsAppNotConnectedError);
    });

    it('lança WhatsAppNotConnectedError quando o socket existe mas o status ainda é "connecting" (não basta o socket existir)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect(); // status fica 'connecting'; socket já existe

      await expect(
        provider.sendMessage('5511888888888@s.whatsapp.net', 'oi'),
      ).rejects.toBeInstanceOf(WhatsAppNotConnectedError);
      expect(createdSockets[0].sendMessage).not.toHaveBeenCalled();
    });

    it('lança WhatsAppNotConnectedError após uma queda de conexão (status volta a "disconnected", mesmo que o socket antigo ainda esteja referenciado até o próximo connect())', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });
      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 401 } } },
      });

      await expect(
        provider.sendMessage('5511888888888@s.whatsapp.net', 'oi'),
      ).rejects.toBeInstanceOf(WhatsAppNotConnectedError);
    });
  });

  describe('sendMediaMessage() — Fase 1, Bloco F1.3 (paridade com sendMessage: exige socket presente E currentStatus === "connected")', () => {
    it('envia imagem via socket.sendMessage() com o payload { image, mimetype, caption } montado por buildBaileysMediaContent', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });
      const buffer = Buffer.from('bytes-da-imagem');

      await provider.sendMediaMessage('5511888888888@s.whatsapp.net', {
        contentType: 'image',
        buffer,
        mimeType: 'image/jpeg',
        caption: 'Segue o comprovante',
      });

      expect(createdSockets[0].sendMessage).toHaveBeenCalledWith('5511888888888@s.whatsapp.net', {
        image: buffer,
        mimetype: 'image/jpeg',
        caption: 'Segue o comprovante',
      });
    });

    it('lança WhatsAppNotConnectedError quando nunca houve connect() (nenhum socket)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );

      await expect(
        provider.sendMediaMessage('5511888888888@s.whatsapp.net', {
          contentType: 'image',
          buffer: Buffer.from('x'),
          mimeType: 'image/jpeg',
        }),
      ).rejects.toBeInstanceOf(WhatsAppNotConnectedError);
    });

    it('lança WhatsAppNotConnectedError quando o socket existe mas o status ainda é "connecting"', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();

      await expect(
        provider.sendMediaMessage('5511888888888@s.whatsapp.net', {
          contentType: 'image',
          buffer: Buffer.from('x'),
          mimeType: 'image/jpeg',
        }),
      ).rejects.toBeInstanceOf(WhatsAppNotConnectedError);
      expect(createdSockets[0].sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('getProfilePictureUrl() — Milestone 6, Bloco M6H-2b (nunca lança, undefined é resultado normal)', () => {
    it('devolve a URL do socket quando conectado', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });

      const url = await provider.getProfilePictureUrl('5511888888888@s.whatsapp.net');

      expect(url).toBe('https://pps.whatsapp.net/fake-avatar.jpg');
      expect(createdSockets[0].profilePictureUrl).toHaveBeenCalledWith(
        '5511888888888@s.whatsapp.net',
        'image',
      );
    });

    it('devolve undefined (não lança) quando não há socket conectado', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );

      await expect(
        provider.getProfilePictureUrl('5511888888888@s.whatsapp.net'),
      ).resolves.toBeUndefined();
    });

    it('devolve undefined (não lança) quando o Baileys rejeita (contato sem foto/privacidade)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });
      createdSockets[0].profilePictureUrl.mockRejectedValueOnce(new Error('not-found'));

      await expect(
        provider.getProfilePictureUrl('5511888888888@s.whatsapp.net'),
      ).resolves.toBeUndefined();
    });

    it('devolve undefined (não lança) quando a query do Baileys nunca responde — timeout próprio, achado do teste real de 2026-07-25 (a query pendurada travava o socket para o resto da sessão, inclusive mensagens reais)', async () => {
      jest.useFakeTimers();
      try {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
        );
        await provider.connect();
        createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });
        // Nunca resolve nem rejeita — simula o WhatsApp não respondendo à query IQ.
        createdSockets[0].profilePictureUrl.mockReturnValue(new Promise(() => {}));

        const resultPromise = provider.getProfilePictureUrl('5511888888888@s.whatsapp.net');
        jest.advanceTimersByTime(10_000);

        await expect(resultPromise).resolves.toBeUndefined();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('messages.upsert → message_received (Milestone 3, Bloco 1)', () => {
    it('emite message_received para uma mensagem de texto 1:1 real (conversation)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
            message: { conversation: 'Oi, preciso de ajuda' },
          },
        ],
      });

      expect(events).toEqual([
        expect.objectContaining({
          type: 'message_received',
          from: '5511888888888@s.whatsapp.net',
          content: 'Oi, preciso de ajuda',
        }),
      ]);
    });

    it('inclui contactName no evento quando o Baileys traz pushName (Milestone 6, Bloco M6H-2b)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
            message: { conversation: 'Oi' },
            pushName: 'Maria Silva',
          },
        ],
      });

      expect(events).toEqual([
        expect.objectContaining({ type: 'message_received', contactName: 'Maria Silva' }),
      ]);
    });

    it('contactName fica undefined quando o Baileys não traz pushName (ou vem vazio)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
            message: { conversation: 'Oi' },
            pushName: '',
          },
        ],
      });

      expect((events[0] as { contactName?: string }).contactName).toBeUndefined();
    });

    it('emite message_received extraindo o texto de extendedTextMessage quando conversation está ausente', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
            message: { extendedTextMessage: { text: 'resposta citada' } },
          },
        ],
      });

      expect(events).toEqual([
        expect.objectContaining({ type: 'message_received', content: 'resposta citada' }),
      ]);
    });

    it('mensagem de um LID: usa o remoteJidAlt (número real) como "from", não o @lid (fix de entrega, corrigido 2026-08-07 — Baileys v7 renomeou senderPn)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: {
              remoteJid: '254352879009802@lid',
              remoteJidAlt: '5584999998888@s.whatsapp.net',
              fromMe: false,
            },
            message: { conversation: 'Ola' },
          },
        ],
      });

      expect(events).toEqual([
        expect.objectContaining({
          type: 'message_received',
          from: '5584999998888@s.whatsapp.net',
          content: 'Ola',
        }),
      ]);
    });

    it('[REGRESSÃO — Fase 1, F1.10] mensagem de um LID SEM remoteJidAlt: cai no @lid bruto (comportamento de fallback documentado, não um bug novo) — protege contra o padrão que já fragmentou conversas duas vezes (senderPn→remoteJidAlt)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: {
              remoteJid: '254352879009802@lid',
              // remoteJidAlt AUSENTE de propósito — cenário real documentado
              // (Baileys não entrega esse campo em toda mensagem de um LID).
              fromMe: false,
            },
            message: { conversation: 'Ola de novo' },
          },
        ],
      });

      // Comportamento ATUAL e ESPERADO do fallback: sem remoteJidAlt, "from"
      // cai no @lid bruto. Este teste não afirma que isso é o ideal — só
      // trava o comportamento conhecido, para que uma mudança futura na
      // extração do JID (ex.: mapear LID→PN via signalRepository) seja uma
      // decisão CONSCIENTE, nunca uma regressão silenciosa não notada.
      expect(events).toEqual([
        expect.objectContaining({
          type: 'message_received',
          from: '254352879009802@lid',
          content: 'Ola de novo',
        }),
      ]);
    });

    it('remove sufixo de device do JID escolhido (jidNormalizedUser)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '5511888888888:12@s.whatsapp.net', fromMe: false },
            message: { conversation: 'oi' },
          },
        ],
      });

      expect(events).toEqual([
        expect.objectContaining({ type: 'message_received', from: '5511888888888@s.whatsapp.net' }),
      ]);
    });

    // ADR #97 — distinguir eco do próprio stack (já persistido por
    // OutboundCommandConsumer/sendAgentMediaMessage) de mensagem enviada
    // pelo operador de outro dispositivo (WhatsApp mobile/web).
    describe('fromMe === true: eco vs. operador em outro dispositivo (ADR #97)', () => {
      it('suprime o eco de uma mensagem enviada por sendMessage() — ID registrado no cache', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
        );
        await provider.connect();
        createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });
        // Configura socket para retornar um key.id conhecido ao enviar.
        createdSockets[0].sendMessage.mockResolvedValue({
          key: { id: 'msg-id-eco', fromMe: true },
        });
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        await provider.sendMessage('5511888888888@s.whatsapp.net', 'mensagem da IA');

        // Eco que o Baileys devolve para o nosso próprio envio.
        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: true, id: 'msg-id-eco' },
              message: { conversation: 'mensagem da IA' },
            },
          ],
        });

        // O eco deve ser descartado — a mensagem já foi persistida pelo OutboundCommandConsumer.
        expect(events).toHaveLength(0);
      });

      it('emite direction=outbound quando fromMe===true MAS o ID não está no cache (operador enviou de outro dispositivo)', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        // Mensagem sem ID no cache → operador enviou do WhatsApp mobile/web.
        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: true, id: 'id-do-celular' },
              message: { conversation: 'Boa tarde, cliente!' },
            },
          ],
        });

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'message_received',
          direction: 'outbound',
          from: '5511888888888@s.whatsapp.net',
          content: 'Boa tarde, cliente!',
        });
      });

      it('usa remoteJid (o contato) como "from" — nunca senderPn (nosso próprio número)', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: {
                remoteJid: '5511888888888@s.whatsapp.net',
                fromMe: true,
                id: 'id-novo',
                senderPn: '5511999999999@s.whatsapp.net',
              },
              message: { conversation: 'oi' },
            },
          ],
        });

        // "from" deve ser o remoteJid (o contato), não o senderPn (nosso número).
        expect(events[0]).toMatchObject({ from: '5511888888888@s.whatsapp.net' });
      });

      it('usa remoteJidAlt (numero real) quando remoteJid é um LID — evita nome bugado com numero longo', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: {
                remoteJid: '53665683484743@lid',
                remoteJidAlt: '5511888888888@s.whatsapp.net',
                fromMe: true,
                id: 'id-lid-outbound',
              },
              message: { conversation: 'oi, tudo bem?' },
            },
          ],
        });

        // "from" deve ser o número real (remoteJidAlt), não o LID bruto.
        expect(events[0]).toMatchObject({
          type: 'message_received',
          direction: 'outbound',
          from: '5511888888888@s.whatsapp.net',
        });
      });

      it('omite contactName em mensagens outbound — pushName seria nosso próprio nome, não do contato', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: true, id: 'id-x' },
              pushName: 'Wesley Francis',
              message: { conversation: 'olá' },
            },
          ],
        });

        expect(events[0]).not.toHaveProperty('contactName');
      });

      it('eco de sendMediaMessage() também é suprimido via cache', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
        );
        await provider.connect();
        createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });
        createdSockets[0].sendMessage.mockResolvedValue({
          key: { id: 'msg-media-eco', fromMe: true },
        });
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        await provider.sendMediaMessage('5511888888888@s.whatsapp.net', {
          contentType: 'image',
          buffer: Buffer.from('x'),
          mimeType: 'image/jpeg',
        });

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: true, id: 'msg-media-eco' },
              message: {
                imageMessage: {
                  url: 'https://mmg.whatsapp.net/img',
                  mimetype: 'image/jpeg',
                  mediaKey: new Uint8Array([1, 2, 3]),
                },
              },
            },
          ],
        });

        expect(events).toHaveLength(0);
      });
    });

    it('ignora mensagens de grupo (remoteJid terminado em @g.us)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '120363000000000000@g.us', fromMe: false },
            message: { conversation: 'mensagem de grupo' },
          },
        ],
      });

      expect(events).toEqual([]);
    });

    // Fase 1, 2026-07-31 (pedido do fundador): a ferramenta deve atuar SOMENTE
    // em conversas privadas — canais/newsletters (transmissão de mão única)
    // também são descartados, mesmo tratamento de grupos.
    it('ignora mensagens de canal/newsletter (remoteJid terminado em @newsletter)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '120363111111111111@newsletter', fromMe: false },
            message: { conversation: 'mensagem de canal' },
          },
        ],
      });

      expect(events).toEqual([]);
    });

    // HOTFIX 2026-07-31 — O BUG REAL relatado pelo fundador: um Status
    // PUBLICADO por um contato chega com `key.remoteJid === 'status@broadcast'`
    // (verificado em `decode-wa-message.js` do pacote real: para
    // `isJidBroadcast(from)`, `chatId = from` e o autor vai para
    // `key.participant`). Como a conversa é chaveada por `contactJid`, todos
    // os Status de todas as pessoas colapsavam numa ÚNICA conversa fantasma,
    // cujo nome mudava a cada novo Status. Estes testes travam a regressão.
    describe('Status publicado por contato (HOTFIX 2026-07-31)', () => {
      it('ignora Status em TEXTO (key.remoteJid === status@broadcast)', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: {
                remoteJid: 'status@broadcast',
                fromMe: false,
                participant: '5511777777777@s.whatsapp.net',
              },
              pushName: 'Henrique Grau',
              broadcast: true,
              message: { conversation: 'Peixinho 🐟' },
            },
          ],
        });

        expect(events).toEqual([]);
      });

      it('ignora Status em IMAGEM (o caso mais comum — foto com legenda)', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
          createFakeCipher(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: {
                remoteJid: 'status@broadcast',
                fromMe: false,
                participant: '5511777777777@s.whatsapp.net',
              },
              pushName: 'Marcelo Papai Urso',
              broadcast: true,
              message: {
                imageMessage: {
                  mimetype: 'image/jpeg',
                  url: 'https://x.enc',
                  mediaKey: Buffer.from('chave'),
                  caption: 'Peixinho 🐟😋',
                },
              },
            },
          ],
        });

        expect(events).toEqual([]);
      });

      it('ignora Status em VÍDEO', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
          createFakeCipher(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: {
                remoteJid: 'status@broadcast',
                fromMe: false,
                participant: '5511777777777@s.whatsapp.net',
              },
              broadcast: true,
              message: {
                videoMessage: {
                  mimetype: 'video/mp4',
                  url: 'https://x.enc',
                  mediaKey: Buffer.from('chave'),
                },
              },
            },
          ],
        });

        expect(events).toEqual([]);
      });

      it('ignora qualquer endereço de broadcast (lista de transmissão), não só status@broadcast', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: { remoteJid: '1234567890@broadcast', fromMe: false },
              message: { conversation: 'transmissão' },
            },
          ],
        });

        expect(events).toEqual([]);
      });

      it('ignora quando broadcast === true mesmo que o remoteJid pareça normal (defesa em profundidade)', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
              broadcast: true,
              message: { conversation: 'algo' },
            },
          ],
        });

        expect(events).toEqual([]);
      });

      it('NÃO ignora uma mensagem privada normal (broadcast ausente/false) — garante que o hotfix não bloqueia cliente de verdade', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
              broadcast: false,
              message: { conversation: 'Oi, quero contratar' },
            },
          ],
        });

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'message_received',
          content: 'Oi, quero contratar',
        });
      });
    });

    // Fase 1, 2026-07-31 — resposta/reação a Status chega como mensagem 1:1
    // normal (não @g.us/@newsletter), mas o contextInfo.remoteJid aponta
    // para 'status@broadcast' (endereço fixo do WhatsApp para Stories).
    it('ignora resposta/reação a um Status (contextInfo.remoteJid === status@broadcast) em mensagem de vídeo', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
        createFakeCipher(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
            message: {
              videoMessage: {
                mimetype: 'video/mp4',
                url: 'https://x.enc',
                mediaKey: Buffer.from('chave'),
                contextInfo: { remoteJid: 'status@broadcast' },
              },
            },
          },
        ],
      });

      expect(events).toEqual([]);
    });

    it('ignora resposta a Status também em mensagem de texto (extendedTextMessage.contextInfo)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
            message: {
              extendedTextMessage: { text: 'kkkk', contextInfo: { remoteJid: 'status@broadcast' } },
            },
          },
        ],
      });

      expect(events).toEqual([]);
    });

    it('NAO ignora uma mensagem de vídeo normal com contextInfo de resposta a OUTRA mensagem do mesmo chat (remoteJid ausente)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
        createFakeCipher(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
            message: {
              videoMessage: {
                mimetype: 'video/mp4',
                url: 'https://x.enc',
                mediaKey: Buffer.from('chave'),
                // contextInfo presente (é uma resposta a algo), mas SEM remoteJid
                // (a mensagem citada está no MESMO chat) — não é Status, não deve ser filtrado.
                contextInfo: {},
              },
            },
          },
        ],
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'message_received', contentType: 'video' });
    });

    it('ignora eventos que não são "notify" nem "append" (ex.: outro tipo desconhecido)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'placeholder',
        messages: [
          {
            key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
            message: { conversation: 'algo' },
          },
        ],
      });

      expect(events).toEqual([]);
    });

    /**
     * MUDANÇA 2026-08-25 (episódio 2): antes deste fix, um 'append' SEM
     * `messageTimestamp` era rejeitado por padrão ("sem evidência, não
     * arrisca"). O critério ficou assimétrico — sem timestamp não há
     * EVIDÊNCIA POSITIVA de que a mensagem é velha, então agora é aceita
     * (mesma regra que sempre valeu pra 'notify', unificada pros dois
     * tipos). Ver docstring de `isStaleQueuedMessage`.
     */
    it('aceita "append" SEM messageTimestamp — sem evidência de que é histórico velho, mesma regra de "notify"', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'append',
        messages: [
          {
            key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
            message: { conversation: 'sem timestamp' },
          },
        ],
      });

      expect(events).toEqual([
        expect.objectContaining({ type: 'message_received', content: 'sem timestamp' }),
      ]);
    });

    /**
     * HOTFIX 2026-08-25 — achado real: cliente respondeu a uma campanha
     * durante a janela de reconexão da sessão, e a resposta nunca chegou.
     * Medido: o WhatsApp entrega esse tipo de mensagem como
     * `messages.upsert { type: 'append' }`, que o código descartava
     * incondicionalmente. Agora é aceita quando `messageTimestamp` está
     * dentro da janela de frescor (30 min).
     */
    it('HOTFIX 2026-08-25: aceita "append" com messageTimestamp RECENTE como mensagem nova (mensagem chegada durante reconexão)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      const nowSeconds = Math.floor(Date.now() / 1000);
      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'append',
        messages: [
          {
            key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
            message: { conversation: 'Oi, recebi sua mensagem' },
            messageTimestamp: nowSeconds,
          },
        ],
      });

      expect(events).toEqual([
        expect.objectContaining({
          type: 'message_received',
          from: '5511888888888@s.whatsapp.net',
          content: 'Oi, recebi sua mensagem',
        }),
      ]);
    });

    it('HOTFIX 2026-08-25: aceita "append" com messageTimestamp como objeto Long (protobuf), não só number', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      const nowSeconds = Math.floor(Date.now() / 1000);
      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'append',
        messages: [
          {
            key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
            message: { conversation: 'via Long' },
            messageTimestamp: { toNumber: () => nowSeconds },
          },
        ],
      });

      expect(events).toEqual([
        expect.objectContaining({ type: 'message_received', content: 'via Long' }),
      ]);
    });

    it('aceita "append" com messageTimestamp de 10 min atrás — dentro da janela de 30 min aumentada (pedido do fundador, episódio 2)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      const tenMinutesAgoSeconds = Math.floor(Date.now() / 1000) - 10 * 60;
      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'append',
        messages: [
          {
            key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
            message: { conversation: 'chegou durante reconexão longa' },
            messageTimestamp: tenMinutesAgoSeconds,
          },
        ],
      });

      expect(events).toEqual([
        expect.objectContaining({
          type: 'message_received',
          content: 'chegou durante reconexão longa',
        }),
      ]);
    });

    it('HOTFIX 2026-08-25: ignora "append" com messageTimestamp ANTIGO (fora da janela de 30 min — histórico real de sincronização)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      const oneHourAgoSeconds = Math.floor(Date.now() / 1000) - 60 * 60;
      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'append',
        messages: [
          {
            key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
            message: { conversation: 'histórico de verdade' },
            messageTimestamp: oneHourAgoSeconds,
          },
        ],
      });

      expect(events).toEqual([]);
    });

    /**
     * HOTFIX 2026-08-25 (episódio 2, achado real, sessão "Lest Conceito"):
     * duas mensagens de 6 dias atrás foram entregues como `type: 'notify'`
     * (não 'append') na reconexão, e a IA respondeu as duas na hora como se
     * fossem novas — porque 'notify' sempre foi aceito incondicionalmente,
     * sem NENHUMA checagem de idade. Ver docstring de
     * `MESSAGE_FRESHNESS_WINDOW_MS`/`isStaleQueuedMessage`.
     */
    it('HOTFIX 2026-08-25 (episódio 2): ignora "notify" com messageTimestamp de DIAS atrás — reentrega de mensagem não lida, não mensagem nova', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      const sixDaysAgoSeconds = Math.floor(Date.now() / 1000) - 6 * 24 * 60 * 60;
      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
            message: { conversation: 'Bom dia irmao' },
            messageTimestamp: sixDaysAgoSeconds,
          },
        ],
      });

      expect(events).toEqual([]);
    });

    it('aceita "notify" com messageTimestamp RECENTE — mensagem em tempo real de verdade', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      const nowSeconds = Math.floor(Date.now() / 1000);
      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
            message: { conversation: 'Oi, tudo bem?' },
            messageTimestamp: nowSeconds,
          },
        ],
      });

      expect(events).toEqual([
        expect.objectContaining({ type: 'message_received', content: 'Oi, tudo bem?' }),
      ]);
    });

    it('ignora mensagens sem nenhum conteúdo reconhecido (mensagem de sistema/reação/enquete)', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          { key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false }, message: {} },
        ],
      });

      expect(events).toEqual([]);
    });

    describe('mensagens de mídia (Fase 1, Bloco F1.1, ADR #90)', () => {
      it('reconhece imageMessage, cifrando a mediaKey (Uint8Array → base64) via Cipher', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
          createFakeCipher(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
              message: {
                imageMessage: {
                  mimetype: 'image/jpeg',
                  url: 'https://mmg.whatsapp.net/fake.enc',
                  mediaKey: Uint8Array.from([1, 2, 3, 4]),
                  caption: 'Olha essa foto',
                },
              },
            },
          ],
        });

        expect(events).toEqual([
          expect.objectContaining({
            type: 'message_received',
            content: 'Olha essa foto',
            contentType: 'image',
            media: {
              mimeType: 'image/jpeg',
              url: 'https://mmg.whatsapp.net/fake.enc',
              mediaKeyEncrypted: `enc:${Buffer.from([1, 2, 3, 4]).toString('base64')}`,
              fileName: undefined,
            },
          }),
        ]);
      });

      it.each([
        ['audioMessage', 'audio'],
        ['videoMessage', 'video'],
        ['documentMessage', 'document'],
        ['stickerMessage', 'sticker'],
      ] as const)('reconhece %s como contentType "%s"', async (field, contentType) => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
          createFakeCipher(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
              message: {
                [field]: {
                  mimetype: 'application/octet-stream',
                  url: 'https://mmg.whatsapp.net/fake2.enc',
                  mediaKey: Uint8Array.from([9, 9, 9]),
                },
              },
            },
          ],
        });

        expect(events).toEqual([
          expect.objectContaining({ type: 'message_received', contentType, content: '' }),
        ]);
      });

      it('inclui fileName na referência quando documentMessage traz um', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
          createFakeCipher(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
              message: {
                documentMessage: {
                  mimetype: 'application/pdf',
                  url: 'https://mmg.whatsapp.net/fake3.enc',
                  mediaKey: Uint8Array.from([5, 6, 7]),
                  fileName: 'contrato.pdf',
                },
              },
            },
          ],
        });

        expect((events[0] as { media?: WhatsAppMediaReferenceEvent }).media?.fileName).toBe(
          'contrato.pdf',
        );
      });

      it('aceita mediaKey já em string (fixture de teste), sem tentar converter de novo', async () => {
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          createFakeLogger(),
          new FakeReconnectionPolicy(),
          createFakeCipher(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
              message: {
                imageMessage: {
                  mimetype: 'image/png',
                  url: 'https://mmg.whatsapp.net/fake4.enc',
                  mediaKey: 'ja-em-base64',
                },
              },
            },
          ],
        });

        expect(
          (events[0] as { media?: WhatsAppMediaReferenceEvent }).media?.mediaKeyEncrypted,
        ).toBe('enc:ja-em-base64');
      });

      it('descarta mídia sem Cipher configurado (nunca persiste mediaKey em texto plano) e loga warn', async () => {
        const logger = createFakeLogger();
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          logger,
          new FakeReconnectionPolicy(),
          // sem cipher (undefined) — comportamento pré-F1.1
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
              message: {
                imageMessage: {
                  mimetype: 'image/jpeg',
                  url: 'https://mmg.whatsapp.net/fake5.enc',
                  mediaKey: Uint8Array.from([1, 2, 3]),
                },
              },
            },
          ],
        });

        expect(events).toEqual([]);
        expect(logger.calls).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ level: 'warn', message: expect.stringContaining('Cipher') }),
          ]),
        );
      });

      it('descarta mídia sem mimetype/url/mediaKey completos, sem logar warn (dado incompleto, não falta de Cipher)', async () => {
        const logger = createFakeLogger();
        const provider = new BaileysProvider(
          'tenant-1',
          'default',
          createFakeCredentialsStore(),
          logger,
          new FakeReconnectionPolicy(),
          createFakeCipher(),
        );
        await provider.connect();
        const events: WhatsAppProviderEvent[] = [];
        provider.onEvent((event) => events.push(event));

        createdSockets[0].ev.handlers['messages.upsert']({
          type: 'notify',
          messages: [
            {
              key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false },
              message: { imageMessage: { mimetype: 'image/jpeg' } },
            },
          ],
        });

        expect(events).toEqual([]);
        expect(logger.calls.filter((c) => c.level === 'warn')).toEqual([]);
      });
    });

    it('processa múltiplas mensagens do mesmo lote, emitindo um evento por mensagem válida', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: 'a@s.whatsapp.net', fromMe: false },
            message: { conversation: 'primeira' },
          },
          {
            key: { remoteJid: 'b@s.whatsapp.net', fromMe: true },
            message: { conversation: 'eco, ignorada' },
          },
          {
            key: { remoteJid: 'c@s.whatsapp.net', fromMe: false },
            message: { conversation: 'segunda' },
          },
        ],
      });

      // A mensagem fromMe sem id no cache de IDs enviados é tratada como
      // mensagem enviada de outro dispositivo (ADR #97) — emitida como outbound.
      expect(events).toHaveLength(3);
      expect(events[0]).toMatchObject({ from: 'a@s.whatsapp.net', content: 'primeira' });
      expect(events[1]).toMatchObject({
        from: 'b@s.whatsapp.net',
        content: 'eco, ignorada',
        direction: 'outbound',
      });
      expect(events[2]).toMatchObject({ from: 'c@s.whatsapp.net', content: 'segunda' });
    });

    it('mensagens.upsert de um socket já substituído (reconexão) deve ser ignorado — mesmo padrão de isCurrentSocket de creds.update/connection.update', async () => {
      const provider = new BaileysProvider(
        'tenant-1',
        'default',
        createFakeCredentialsStore(),
        createFakeLogger(),
        new FakeReconnectionPolicy(),
      );
      await provider.connect();
      const firstSocketMessagesHandler = createdSockets[0].ev.handlers['messages.upsert'];
      await provider.connect(); // reconecta — socket novo, antigo substituído

      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      firstSocketMessagesHandler({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: 'a@s.whatsapp.net', fromMe: false },
            message: { conversation: 'tardia, do socket antigo' },
          },
        ],
      });

      expect(events).toEqual([]);
    });
  });
});

describe('buildBaileysMediaContent() — Fase 1, Bloco F1.3 (função pura, sem I/O)', () => {
  const buffer = Buffer.from('bytes');

  it('image: monta { image, mimetype, caption }', () => {
    expect(
      buildBaileysMediaContent({
        contentType: 'image',
        buffer,
        mimeType: 'image/jpeg',
        caption: 'legenda',
      }),
    ).toEqual({
      image: buffer,
      mimetype: 'image/jpeg',
      caption: 'legenda',
    });
  });

  it('image sem caption: caption fica undefined (Baileys aceita)', () => {
    expect(
      buildBaileysMediaContent({ contentType: 'image', buffer, mimeType: 'image/jpeg' }),
    ).toEqual({
      image: buffer,
      mimetype: 'image/jpeg',
      caption: undefined,
    });
  });

  it('audio: monta { audio, mimetype, ptt: false } — nunca "voice note"', () => {
    expect(
      buildBaileysMediaContent({ contentType: 'audio', buffer, mimeType: 'audio/ogg' }),
    ).toEqual({
      audio: buffer,
      mimetype: 'audio/ogg',
      ptt: false,
    });
  });

  it('video: monta { video, mimetype, caption }', () => {
    expect(
      buildBaileysMediaContent({
        contentType: 'video',
        buffer,
        mimeType: 'video/mp4',
        caption: 'legenda',
      }),
    ).toEqual({
      video: buffer,
      mimetype: 'video/mp4',
      caption: 'legenda',
    });
  });

  it('document: monta { document, mimetype, fileName, caption }', () => {
    expect(
      buildBaileysMediaContent({
        contentType: 'document',
        buffer,
        mimeType: 'application/pdf',
        fileName: 'contrato.pdf',
        caption: 'Segue o contrato',
      }),
    ).toEqual({
      document: buffer,
      mimetype: 'application/pdf',
      fileName: 'contrato.pdf',
      caption: 'Segue o contrato',
    });
  });

  it('document sem fileName: usa o fallback "arquivo"', () => {
    expect(
      buildBaileysMediaContent({ contentType: 'document', buffer, mimeType: 'application/pdf' }),
    ).toEqual({
      document: buffer,
      mimetype: 'application/pdf',
      fileName: 'arquivo',
      caption: undefined,
    });
  });
});
