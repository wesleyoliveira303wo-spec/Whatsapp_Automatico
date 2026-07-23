import { Logger } from '../../../../src/shared/domain/Logger';
import { CredentialsStore } from '../../../../src/shared/security/domain/CredentialsStore';

const baileysProviderConstructorSpy = jest.fn();

/**
 * Mock explicito (via factory, nao automock) do CONSTRUTOR de
 * `BaileysProvider` -- nunca do pacote `@whiskeysockets/baileys` em si.
 * Este teste so precisa provar que `BaileysProviderFactory` delega
 * corretamente para `new BaileysProvider(...)` com os argumentos certos; o
 * comportamento interno de `BaileysProvider` (conexao, eventos, QR, etc.)
 * ja e coberto por `BaileysProvider.test.ts` e nao e reexercitado aqui.
 * Usar uma factory explicita (em vez de automock) evita que este teste
 * dependa, de qualquer forma, do pacote real `@whiskeysockets/baileys`.
 */
jest.mock('../../../../src/services/whatsapp/infrastructure/providers/baileys/BaileysProvider', () => {
  return {
    BaileysProvider: jest.fn().mockImplementation((...args: unknown[]) => {
      baileysProviderConstructorSpy(...args);
      return { __isMockBaileysProviderInstance: true };
    }),
  };
});

import { BaileysProviderFactory } from '../../../../src/services/whatsapp/infrastructure/providers/baileys/BaileysProviderFactory';
import { WhatsAppReconnectionPolicy } from '../../../../src/services/whatsapp/infrastructure/providers/baileys/WhatsAppReconnectionPolicy';

class FakeLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class FakeCredentialsStore implements CredentialsStore {
  async get(): Promise<string | null> {
    return null;
  }
  async getAll(): Promise<Record<string, string>> {
    return {};
  }
  async set(): Promise<void> {}
  async remove(): Promise<void> {}
  async clear(): Promise<void> {}
}

describe('BaileysProviderFactory', () => {
  beforeEach(() => {
    baileysProviderConstructorSpy.mockClear();
  });

  it('cria um BaileysProvider passando tenantId, sessionName, credentialsStore, logger e uma ReconnectionPolicy', () => {
    const credentialsStore = new FakeCredentialsStore();
    const logger = new FakeLogger();
    const factory = new BaileysProviderFactory(credentialsStore, logger);

    const provider = factory.create('tenant-1', 'vendas');

    expect(baileysProviderConstructorSpy).toHaveBeenCalledTimes(1);
    expect(baileysProviderConstructorSpy).toHaveBeenCalledWith(
      'tenant-1',
      'vendas',
      credentialsStore,
      logger,
      expect.any(WhatsAppReconnectionPolicy),
    );
    expect(provider).toBeDefined();
  });

  it('repassa o mesmo credentialsStore/logger do construtor da factory em cada create() (compartilhados entre sessoes)', () => {
    const credentialsStore = new FakeCredentialsStore();
    const logger = new FakeLogger();
    const factory = new BaileysProviderFactory(credentialsStore, logger);

    factory.create('tenant-1', 'vendas');
    factory.create('tenant-2', 'suporte');

    expect(baileysProviderConstructorSpy).toHaveBeenNthCalledWith(
      1,
      'tenant-1',
      'vendas',
      credentialsStore,
      logger,
      expect.any(WhatsAppReconnectionPolicy),
    );
    expect(baileysProviderConstructorSpy).toHaveBeenNthCalledWith(
      2,
      'tenant-2',
      'suporte',
      credentialsStore,
      logger,
      expect.any(WhatsAppReconnectionPolicy),
    );
  });

  it('[Production Hardening, Bloco 8b] cria uma ReconnectionPolicy NOVA (própria) a cada create() — estado de backoff/circuit breaker nunca é compartilhado entre sessões', () => {
    const factory = new BaileysProviderFactory(new FakeCredentialsStore(), new FakeLogger());

    factory.create('tenant-1', 'vendas');
    factory.create('tenant-2', 'suporte');

    const policyA = baileysProviderConstructorSpy.mock.calls[0][4];
    const policyB = baileysProviderConstructorSpy.mock.calls[1][4];
    expect(policyA).toBeInstanceOf(WhatsAppReconnectionPolicy);
    expect(policyB).toBeInstanceOf(WhatsAppReconnectionPolicy);
    expect(policyA).not.toBe(policyB);
  });

  it('cria uma nova instancia a cada chamada de create(), mesmo com os mesmos argumentos (nao ha cache/reuso na factory)', () => {
    const factory = new BaileysProviderFactory(new FakeCredentialsStore(), new FakeLogger());

    const providerA = factory.create('tenant-1', 'vendas');
    const providerB = factory.create('tenant-1', 'vendas'); // mesmos argumentos

    expect(providerA).not.toBe(providerB);
    expect(baileysProviderConstructorSpy).toHaveBeenCalledTimes(2);
  });
});
