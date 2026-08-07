/**
 * Mock de `bullmq` — evita que `createConversationsComposition()` abra uma
 * conexão real ao construir a `Queue` produtora de `ai-reply` (este teste
 * verifica só o WIRING, mesmo racional de `compositionRoot.test.ts` de
 * `whatsapp`, que mocka `@whiskeysockets/baileys` pelo mesmo motivo: nenhuma
 * infraestrutura real deve ser tocada para provar que a cadeia de
 * construção não lança).
 */
jest.mock('bullmq', () => ({
  __esModule: true,
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn() })),
}));

import { PrismaClient } from '@prisma/client';
import { createConversationsComposition } from '../../../src/services/conversations/compositionRoot';
import { MessageIngestionService } from '../../../src/services/conversations/application/MessageIngestionService';
import { ConversationsService } from '../../../src/services/conversations/application/ConversationsService';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';

describe('createConversationsComposition (Milestone 3, Bloco 5 — D6/D15)', () => {
  it('monta a cadeia completa (repositórios, aiReplyScheduler, MessageIngestionService, ConversationsService) sem lançar', () => {
    const fakePrisma = {} as unknown as PrismaClient;
    const fakeRedisConnection = {} as never;

    const composition = createConversationsComposition(
      fakePrisma,
      fakeRedisConnection,
      new NoopLogger(),
    );

    expect(composition.messageIngestionService).toBeInstanceOf(MessageIngestionService);
    expect(composition.conversationsService).toBeInstanceOf(ConversationsService);
  });
});
