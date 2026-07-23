import { PrismaClient } from '@prisma/client';
import { createAiComposition } from '../../../src/services/ai/compositionRoot';
import { AiInteractionsService } from '../../../src/services/ai/application/AiInteractionsService';
import { AiBusinessProfileService } from '../../../src/services/ai/application/AiBusinessProfileService';
import { PrismaAiInteractionRepository } from '../../../src/services/ai/infrastructure/repositories/PrismaAiInteractionRepository';
import { PrismaAiBusinessProfileRepository } from '../../../src/services/ai/infrastructure/repositories/PrismaAiBusinessProfileRepository';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';

describe('createAiComposition (Milestone 3, Bloco 5 — D6/D15)', () => {
  it('monta aiInteractionRepository e aiInteractionsService sem lançar, dado um PrismaClient qualquer', () => {
    const fakePrisma = {} as unknown as PrismaClient;

    const composition = createAiComposition(fakePrisma, new NoopLogger());

    expect(composition.aiInteractionRepository).toBeInstanceOf(PrismaAiInteractionRepository);
    expect(composition.aiInteractionsService).toBeInstanceOf(AiInteractionsService);
  });

  it('monta também o repositório e o service da Base de Conhecimento (Nível 1)', () => {
    const fakePrisma = {} as unknown as PrismaClient;

    const composition = createAiComposition(fakePrisma, new NoopLogger());

    expect(composition.aiBusinessProfileRepository).toBeInstanceOf(PrismaAiBusinessProfileRepository);
    expect(composition.aiBusinessProfileService).toBeInstanceOf(AiBusinessProfileService);
  });
});
