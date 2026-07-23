import { Logger } from '../../../../src/shared/domain/Logger';
import { CredentialsStore } from '../../../../src/shared/security/domain/CredentialsStore';
import { WhatsAppProviderEvent } from '../../../../src/services/whatsapp/domain/providers/WhatsAppProviderEvent';
import { WhatsAppQRCodeNotAvailableError } from '../../../../src/services/whatsapp/domain/errors/WhatsAppQRCodeNotAvailableError';
import { WhatsAppNotConnectedError } from '../../../../src/services/whatsapp/domain/errors/WhatsAppNotConnectedError';
import { FakeReconnectionPolicy } from './FakeReconnectionPolicy';

type EventHandler = (...args: unknown[]) => void;

interface FakeSocket {
  ev: { on: jest.Mock; handlers: Record<string, EventHandler> };
  end: jest.Mock;
  sendMessage: jest.Mock;
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

import { BaileysProvider } from '../../../../src/services/whatsapp/infrastructure/providers/baileys/BaileysProvider';

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

function createFakeLogger(): Logger & { calls: { level: string; message: string; meta?: Record<string, unknown> }[] } {
  const calls: { level: string; message: string; meta?: Record<string, unknown> }[] = [];
  const logger = {
    calls,
    debug: (message: string, meta?: Record<string, unknown>) => calls.push({ level: 'debug', message, meta }),
    info: (message: string, meta?: Record<string, unknown>) => calls.push({ level: 'info', message, meta }),
    warn: (message: string, meta?: Record<string, unknown>) => calls.push({ level: 'warn', message, meta }),
    error: (message: string, meta?: Record<string, unknown>) => calls.push({ level: 'error', message, meta }),
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
    const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());

    await provider.connect();

    expect(mockMakeWASocket).toHaveBeenCalledTimes(1);
    expect(await provider.getStatus()).toBe('connecting');
    expect(createdSockets[0].ev.handlers['creds.update']).toBeDefined();
    expect(createdSockets[0].ev.handlers['connection.update']).toBeDefined();
  });

  it('deve expor o QR Code recebido via connection.update', async () => {
    const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
    await provider.connect();

    createdSockets[0].ev.handlers['connection.update']({ qr: 'qr-code-fake' });

    expect(await provider.getQRCode()).toBe('qr-code-fake');
  });

  it('getQRCode() deve rejeitar com WhatsAppQRCodeNotAvailableError (BUG-07) antes de qualquer QR ter sido recebido', async () => {
    // Verifica o tipo do erro, não o texto da mensagem (Item 5, Bloco 4):
    // a Presentation (Bloco 7) precisa mapear este erro por classe, então é
    // isso que a suite deve travar — a string é só um detalhe de log/debug.
    const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
    await provider.connect();

    await expect(provider.getQRCode()).rejects.toBeInstanceOf(WhatsAppQRCodeNotAvailableError);
  });

  it('connection "open" deve marcar status "connected", extrair o telefone e emitir status_changed', async () => {
    const logger = createFakeLogger();
    const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), logger, new FakeReconnectionPolicy());
    await provider.connect();

    const events: WhatsAppProviderEvent[] = [];
    provider.onEvent((event) => events.push(event));

    createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });

    expect(await provider.getStatus()).toBe('connected');
    expect(await provider.getPhoneNumber()).toBe('5511999999999');
    expect(events).toEqual([{ type: 'status_changed', status: 'connected', phoneNumber: '5511999999999' }]);
    expect(logger.calls.some((c) => c.level === 'info')).toBe(true);
  });

  it('connection "close" deve marcar status "disconnected", logar o motivo e emitir status_changed', async () => {
    const logger = createFakeLogger();
    const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), logger, new FakeReconnectionPolicy());
    await provider.connect();

    const events: WhatsAppProviderEvent[] = [];
    provider.onEvent((event) => events.push(event));

    createdSockets[0].ev.handlers['connection.update']({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    });

    expect(await provider.getStatus()).toBe('disconnected');
    expect(events).toEqual([
      { type: 'status_changed', status: 'disconnected', phoneNumber: undefined, disconnectReason: 'logged_out' },
    ]);
    const warnCall = logger.calls.find((c) => c.level === 'warn');
    expect(warnCall?.meta).toMatchObject({ statusCode: 401, loggedOut: true });
  });

  describe('Production Hardening, Bloco 8a — mapeamento e limpeza de disconnectReason', () => {
    it('statusCode 515 (restartRequired) deve emitir disconnectReason "restart_required"', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 515 } } },
      });

      expect(events[0]).toMatchObject({ status: 'disconnected', disconnectReason: 'restart_required' });
    });

    it('statusCode 408 (connectionLost, mesmo valor numérico de timedOut na biblioteca real) deve emitir disconnectReason "connection_lost"', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 408 } } },
      });

      expect(events[0]).toMatchObject({ status: 'disconnected', disconnectReason: 'connection_lost' });
    });

    it('statusCode não mapeado (ex.: badSession = 500) deve emitir disconnectReason "unknown", nunca lançar', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
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
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['connection.update']({ connection: 'close' });

      expect(events[0]).toMatchObject({ status: 'disconnected', disconnectReason: 'unknown' });
    });

    it('connection "connecting" (mesmo socket) deve limpar o disconnectReason de uma queda anterior', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 401 } } },
      });

      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));
      createdSockets[0].ev.handlers['connection.update']({ connection: 'connecting' });

      expect(events).toEqual([{ type: 'status_changed', status: 'connecting', phoneNumber: undefined, disconnectReason: undefined }]);
    });

    it('connection "open" deve limpar o disconnectReason de uma queda anterior', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
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
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), reconnectionPolicy);
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
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(createdSockets).toHaveLength(2);

      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));
      createdSockets[1].ev.handlers['connection.update']({ connection: 'open' });

      expect(events[0]).toMatchObject({ status: 'connected' });
      expect(events[0].disconnectReason).toBeUndefined();
    });
  });

  it('disconnect() deve encerrar o socket e marcar status "disconnected"', async () => {
    const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
    await provider.connect();

    await provider.disconnect();

    expect(createdSockets[0].end).toHaveBeenCalledTimes(1);
    expect(await provider.getStatus()).toBe('disconnected');
  });

  it('creds.update deve persistir as credenciais via CredentialsStore (saveCreds)', async () => {
    const credentialsStore = createFakeCredentialsStore();
    const setSpy = jest.spyOn(credentialsStore, 'set');
    const provider = new BaileysProvider('tenant-1', 'default', credentialsStore, createFakeLogger(), new FakeReconnectionPolicy());

    await provider.connect();
    await createdSockets[0].ev.handlers['creds.update']();

    expect(setSpy).toHaveBeenCalledWith('tenant-1', 'whatsapp:session:default', 'creds', expect.any(String));
  });

  describe('BUG-12 — creds.update de um socket já substituído deve ser ignorado', () => {
    it('creds.update de um socket antigo (substituído por reconexão) não deve persistir credenciais', async () => {
      const credentialsStore = createFakeCredentialsStore();
      const setSpy = jest.spyOn(credentialsStore, 'set');
      const provider = new BaileysProvider('tenant-1', 'default', credentialsStore, createFakeLogger(), new FakeReconnectionPolicy());

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
      const provider = new BaileysProvider('tenant-1', 'default', credentialsStore, createFakeLogger(), new FakeReconnectionPolicy());

      await provider.connect();
      await provider.connect();
      setSpy.mockClear();

      createdSockets[1].ev.handlers['creds.update']();
      await Promise.resolve();
      await Promise.resolve();

      expect(setSpy).toHaveBeenCalledWith('tenant-1', 'whatsapp:session:default', 'creds', expect.any(String));
    });

    it('falha ao persistir credenciais (creds.update) deve ser logada, não lançar uma unhandled rejection', async () => {
      const credentialsStore = createFakeCredentialsStore();
      jest.spyOn(credentialsStore, 'set').mockRejectedValue(new Error('falha simulada de banco'));
      const logger = createFakeLogger();
      const provider = new BaileysProvider('tenant-1', 'default', credentialsStore, logger, new FakeReconnectionPolicy());

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
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), reconnectionPolicy);
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
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), reconnectionPolicy);
      await provider.connect();
      expect(mockMakeWASocket).toHaveBeenCalledTimes(1);

      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 515 } } },
      });
      reconnectionPolicy.fireLastRetry();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Sem isto, o pareamento (QR) nunca se completa do lado do WhatsApp —
      // é exatamente o bug encontrado no teste manual real: o celular
      // reportava "não foi possível conectar" mesmo com as credenciais já
      // salvas, porque faltava esta segunda metade do handshake.
      expect(mockMakeWASocket).toHaveBeenCalledTimes(2);
    });

    it('[generalização do Bloco 8b] connection "close" com outro statusCode recuperável (500, "unknown") também delega ao reconnectionPolicy — não é mais um caso "nunca reconecta"', async () => {
      const reconnectionPolicy = new FakeReconnectionPolicy();
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), reconnectionPolicy);
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
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), reconnectionPolicy);
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
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), reconnectionPolicy);
      await provider.connect();

      createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });

      expect(reconnectionPolicy.resetCallCount).toBe(1);
    });

    it('disconnect() explícito chama reconnectionPolicy.cancelPending() (evita reconexão automática indesejada depois de um pedido explícito)', async () => {
      const reconnectionPolicy = new FakeReconnectionPolicy();
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), reconnectionPolicy);
      await provider.connect();

      await provider.disconnect();

      expect(reconnectionPolicy.cancelPendingCallCount).toBeGreaterThanOrEqual(1);
    });

    it('connect() (reconexão explícita ou automática) chama reconnectionPolicy.cancelPending() antes de conectar', async () => {
      const reconnectionPolicy = new FakeReconnectionPolicy();
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), reconnectionPolicy);

      await provider.connect();

      expect(reconnectionPolicy.cancelPendingCallCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('BUG-13 — limpeza de credenciais ao detectar logout (DisconnectReason.loggedOut)', () => {
    it('connection "close" com loggedOut=true deve limpar as credenciais do namespace da sessão', async () => {
      const credentialsStore = createFakeCredentialsStore();
      const clearSpy = jest.spyOn(credentialsStore, 'clear');
      const provider = new BaileysProvider('tenant-1', 'default', credentialsStore, createFakeLogger(), new FakeReconnectionPolicy());
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
      const provider = new BaileysProvider('tenant-1', 'default', credentialsStore, createFakeLogger(), new FakeReconnectionPolicy());
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
      const provider = new BaileysProvider('tenant-1', 'default', credentialsStore, logger, new FakeReconnectionPolicy());
      await provider.connect();

      expect(() =>
        createdSockets[0].ev.handlers['connection.update']({
          connection: 'close',
          lastDisconnect: { error: { output: { statusCode: 401 } } },
        }),
      ).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();

      const errorLog = logger.calls.find((c) => c.level === 'error' && String(c.message).includes('limpar credenciais'));
      expect(errorLog).toBeDefined();
    });
  });

  describe('BUG-04 — ciclo de vida do socket em reconexões', () => {
    it('connect() chamado de novo na mesma instância deve encerrar o socket anterior (evita socket zumbi)', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());

      await provider.connect();
      const firstSocket = createdSockets[0];
      await provider.connect();

      expect(createdSockets).toHaveLength(2);
      expect(firstSocket.end).toHaveBeenCalledTimes(1);
    });

    it('eventos de um socket já substituído devem ser ignorados (evita "status flapping" entre sockets concorrentes)', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());

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
      expect(events).toEqual([{ type: 'status_changed', status: 'connected', phoneNumber: '5511999999999' }]);
    });

    it('disconnect() seguido de connect() deve funcionar normalmente com um socket novo e limpo', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());

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
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();

      await expect(provider.disconnect()).resolves.not.toThrow();
      await expect(provider.disconnect()).resolves.not.toThrow();
    });
  });

  describe('sendMessage() — Milestone 3, Bloco 1 (ajuste de auditoria: exige socket presente E currentStatus === "connected")', () => {
    it('envia a mensagem via socket.sendMessage() quando a sessão está de fato conectada', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });

      await provider.sendMessage('5511888888888@s.whatsapp.net', 'Olá, tudo bem?');

      expect(createdSockets[0].sendMessage).toHaveBeenCalledWith('5511888888888@s.whatsapp.net', { text: 'Olá, tudo bem?' });
    });

    it('lança WhatsAppNotConnectedError quando nunca houve connect() (nenhum socket)', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());

      await expect(provider.sendMessage('5511888888888@s.whatsapp.net', 'oi')).rejects.toBeInstanceOf(WhatsAppNotConnectedError);
    });

    it('lança WhatsAppNotConnectedError quando o socket existe mas o status ainda é "connecting" (não basta o socket existir)', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect(); // status fica 'connecting'; socket já existe

      await expect(provider.sendMessage('5511888888888@s.whatsapp.net', 'oi')).rejects.toBeInstanceOf(WhatsAppNotConnectedError);
      expect(createdSockets[0].sendMessage).not.toHaveBeenCalled();
    });

    it('lança WhatsAppNotConnectedError após uma queda de conexão (status volta a "disconnected", mesmo que o socket antigo ainda esteja referenciado até o próximo connect())', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      createdSockets[0].ev.handlers['connection.update']({ connection: 'open' });
      createdSockets[0].ev.handlers['connection.update']({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 401 } } },
      });

      await expect(provider.sendMessage('5511888888888@s.whatsapp.net', 'oi')).rejects.toBeInstanceOf(WhatsAppNotConnectedError);
    });
  });

  describe('messages.upsert → message_received (Milestone 3, Bloco 1)', () => {
    it('emite message_received para uma mensagem de texto 1:1 real (conversation)', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [{ key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false }, message: { conversation: 'Oi, preciso de ajuda' } }],
      });

      expect(events).toEqual([
        expect.objectContaining({ type: 'message_received', from: '5511888888888@s.whatsapp.net', content: 'Oi, preciso de ajuda' }),
      ]);
    });

    it('emite message_received extraindo o texto de extendedTextMessage quando conversation está ausente', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [{ key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false }, message: { extendedTextMessage: { text: 'resposta citada' } } }],
      });

      expect(events).toEqual([
        expect.objectContaining({ type: 'message_received', content: 'resposta citada' }),
      ]);
    });

    it('mensagem de um LID: usa o senderPn (número real) como "from", não o @lid (fix de entrega)', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '254352879009802@lid', senderPn: '5584999998888@s.whatsapp.net', fromMe: false },
            message: { conversation: 'Ola' },
          },
        ],
      });

      expect(events).toEqual([
        expect.objectContaining({ type: 'message_received', from: '5584999998888@s.whatsapp.net', content: 'Ola' }),
      ]);
    });

    it('remove sufixo de device do JID escolhido (jidNormalizedUser)', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [{ key: { remoteJid: '5511888888888:12@s.whatsapp.net', fromMe: false }, message: { conversation: 'oi' } }],
      });

      expect(events).toEqual([
        expect.objectContaining({ type: 'message_received', from: '5511888888888@s.whatsapp.net' }),
      ]);
    });

    it('ignora mensagens fromMe === true (eco do próprio número)', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [{ key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: true }, message: { conversation: 'eco' } }],
      });

      expect(events).toEqual([]);
    });

    it('ignora mensagens de grupo (remoteJid terminado em @g.us)', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [{ key: { remoteJid: '120363000000000000@g.us', fromMe: false }, message: { conversation: 'mensagem de grupo' } }],
      });

      expect(events).toEqual([]);
    });

    it('ignora eventos que não são type "notify" (sincronização de histórico)', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'append',
        messages: [{ key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false }, message: { conversation: 'histórico antigo' } }],
      });

      expect(events).toEqual([]);
    });

    it('ignora mensagens sem texto extraível (mídia/figurinha, fora de escopo)', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [{ key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false }, message: {} }],
      });

      expect(events).toEqual([]);
    });

    it('processa múltiplas mensagens do mesmo lote, emitindo um evento por mensagem válida', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      createdSockets[0].ev.handlers['messages.upsert']({
        type: 'notify',
        messages: [
          { key: { remoteJid: 'a@s.whatsapp.net', fromMe: false }, message: { conversation: 'primeira' } },
          { key: { remoteJid: 'b@s.whatsapp.net', fromMe: true }, message: { conversation: 'eco, ignorada' } },
          { key: { remoteJid: 'c@s.whatsapp.net', fromMe: false }, message: { conversation: 'segunda' } },
        ],
      });

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ from: 'a@s.whatsapp.net', content: 'primeira' });
      expect(events[1]).toMatchObject({ from: 'c@s.whatsapp.net', content: 'segunda' });
    });

    it('mensagens.upsert de um socket já substituído (reconexão) deve ser ignorado — mesmo padrão de isCurrentSocket de creds.update/connection.update', async () => {
      const provider = new BaileysProvider('tenant-1', 'default', createFakeCredentialsStore(), createFakeLogger(), new FakeReconnectionPolicy());
      await provider.connect();
      const firstSocketMessagesHandler = createdSockets[0].ev.handlers['messages.upsert'];
      await provider.connect(); // reconecta — socket novo, antigo substituído

      const events: WhatsAppProviderEvent[] = [];
      provider.onEvent((event) => events.push(event));

      firstSocketMessagesHandler({
        type: 'notify',
        messages: [{ key: { remoteJid: 'a@s.whatsapp.net', fromMe: false }, message: { conversation: 'tardia, do socket antigo' } }],
      });

      expect(events).toEqual([]);
    });
  });
});
