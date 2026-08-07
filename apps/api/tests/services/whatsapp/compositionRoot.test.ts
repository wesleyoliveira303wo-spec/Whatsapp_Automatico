/**
 * Mock "virtual" de `@whiskeysockets/baileys` - mesmo motivo e mesmo shape
 * de `BaileysProvider.test.ts`: o pacote real e publicado em ESM puro, que o
 * Jest (CommonJS) nao consegue parsear se carregado de verdade. Este arquivo
 * importa `compositionRoot.ts`, que importa `BaileysProviderFactory.ts`, que
 * importa `BaileysProvider.ts` - sem este mock, a suite quebraria com
 * `SyntaxError: Cannot use import statement outside a module` (regressao
 * real encontrada e corrigida durante o Bloco 8, ver DECISIONS.md).
 */
jest.mock(
  '@whiskeysockets/baileys',
  () => ({
    __esModule: true,
    default: jest.fn(),
    DisconnectReason: { loggedOut: 401 },
    BufferJSON: {
      replacer: (_key: string, value: unknown) => value,
      reviver: (_key: string, value: unknown) => value,
    },
    initAuthCreds: () => ({}),
  }),
  { virtual: true },
);

/**
 * Mock de `bullmq` - Milestone 3, Bloco 5 (D7): evita que
 * `createOutboundCommandConsumerWorker()` abra uma conexao real ao construir
 * o `Worker` consumidor de `whatsapp-outbound`. Mesmo racional do mock de
 * `@whiskeysockets/baileys` acima: so o WIRING e testado aqui.
 */
jest.mock('bullmq', () => ({
  __esModule: true,
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

import { PrismaClient } from '@prisma/client';
import {
  createWhatsAppSessionsRegistry,
  createWhatsAppSessionsComposition,
  createOutboundCommandConsumerWorker,
} from '../../../src/services/whatsapp/compositionRoot';
import { WhatsAppConnectionRegistry } from '../../../src/services/whatsapp/application/WhatsAppConnectionRegistry';
import { WhatsAppSessionService } from '../../../src/services/whatsapp/application/WhatsAppSessionService';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeConversationRepository, FakeMessageRepository } from '../conversations/testDoubles';
import { FakeAiInteractionRepository } from '../ai/infrastructure/FakeAiInteractionRepository';

// Chave valida so na forma (32 bytes apos decode base64) - nenhuma chamada
// real ao Prisma/crypto acontece na CONSTRUCAO da cadeia, so no uso.
const VALID_BASE64_KEY = Buffer.alloc(32, 1).toString('base64');
const VALID_API_KEY_PEPPER = 'pepper-de-teste-nao-vazio';

describe('createWhatsAppSessionsRegistry (composition root)', () => {
  it('monta a cadeia real (Cipher -> CredentialsStore -> ProviderFactory -> Repository -> Registry) sem lancar, dado um PrismaClient e uma chave validos', () => {
    // Nenhum metodo e chamado no `prisma` durante a construcao (cada classe
    // so guarda a referencia) - um objeto vazio tipado basta para este teste
    // de wiring, sem precisar de banco real.
    const fakePrisma = {} as unknown as PrismaClient;

    const registry = createWhatsAppSessionsRegistry(fakePrisma, VALID_BASE64_KEY, new NoopLogger());

    expect(registry).toBeInstanceOf(WhatsAppConnectionRegistry);
  });

  it('propaga o erro de AesGcmCipher se a chave mestra for invalida (tamanho errado)', () => {
    const fakePrisma = {} as unknown as PrismaClient;

    expect(() =>
      createWhatsAppSessionsRegistry(fakePrisma, 'chave-invalida', new NoopLogger()),
    ).toThrow();
  });
});

describe('createWhatsAppSessionsComposition (Production Hardening, Bloco 7)', () => {
  it('monta o sessionService e o middleware requireApiKey sem lancar, dados PrismaClient/chave/pepper validos', () => {
    const fakePrisma = {} as unknown as PrismaClient;

    const composition = createWhatsAppSessionsComposition(
      fakePrisma,
      VALID_BASE64_KEY,
      VALID_API_KEY_PEPPER,
      new NoopLogger(),
    );

    expect(composition.sessionService).toBeInstanceOf(WhatsAppSessionService);
    expect(typeof composition.requireApiKey).toBe('function');
    // Milestone 3, Bloco 5 - `registry` agora e exposto (D7: precisa ser
    // reaproveitado por `createOutboundCommandConsumerWorker`, mesma
    // instancia, nao um segundo pool).
    expect(composition.registry).toBeInstanceOf(WhatsAppConnectionRegistry);
    // Fase 1, Bloco F1.1 (ADR #90) / Bloco F1.3 — `mediaDownloader`/
    // `mediaSender` sempre expostos, prontos para injeção tardia em
    // `ConversationsService.setMediaDownloader()`/`setMediaSender()`.
    expect(composition.mediaDownloader).toBeDefined();
    expect(composition.mediaSender).toBeDefined();
  });

  it('Milestone 3, Bloco 5 (D5) - aceita um messageReceivedHandler opcional, sem quebrar quando omitido', () => {
    const fakePrisma = {} as unknown as PrismaClient;
    const handler = { handle: jest.fn() };

    expect(() =>
      createWhatsAppSessionsComposition(
        fakePrisma,
        VALID_BASE64_KEY,
        VALID_API_KEY_PEPPER,
        new NoopLogger(),
        handler,
      ),
    ).not.toThrow();
  });

  it('propaga o erro de HmacSha256ApiKeyHasher se o pepper for vazio', () => {
    const fakePrisma = {} as unknown as PrismaClient;

    expect(() =>
      createWhatsAppSessionsComposition(fakePrisma, VALID_BASE64_KEY, '', new NoopLogger()),
    ).toThrow();
  });

  it('propaga o erro de AesGcmCipher se a chave mestra for invalida, mesmo com pepper valido', () => {
    const fakePrisma = {} as unknown as PrismaClient;

    expect(() =>
      createWhatsAppSessionsComposition(
        fakePrisma,
        'chave-invalida',
        VALID_API_KEY_PEPPER,
        new NoopLogger(),
      ),
    ).toThrow();
  });
});

describe('createOutboundCommandConsumerWorker (Milestone 3, Bloco 5 - D7)', () => {
  it('monta o Worker sem lancar, dado um registry e os repositorios de outros bounded contexts', () => {
    const fakePrisma = {} as unknown as PrismaClient;
    const registry = createWhatsAppSessionsRegistry(fakePrisma, VALID_BASE64_KEY, new NoopLogger());
    const conversationRepository = new FakeConversationRepository();
    const messageRepository = new FakeMessageRepository();
    const aiInteractionRepository = new FakeAiInteractionRepository();
    const fakeRedisConnection = {} as never;

    const worker = createOutboundCommandConsumerWorker(
      registry,
      conversationRepository,
      messageRepository,
      aiInteractionRepository,
      new NoopLogger(),
      fakeRedisConnection,
    );

    expect(worker).toBeDefined();
  });
});
