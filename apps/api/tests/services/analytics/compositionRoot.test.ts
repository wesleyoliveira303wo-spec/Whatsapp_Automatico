import { PrismaClient } from '@prisma/client';
import { createAnalyticsComposition } from '../../../src/services/analytics/compositionRoot';
import { AnalyticsService } from '../../../src/services/analytics/application/AnalyticsService';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';

/**
 * Teste de wiring do composition root de Analytics (Milestone 4, Bloco M4C).
 * Nenhum metodo do `prisma` e chamado na CONSTRUCAO (cada classe so guarda a
 * referencia) — um objeto vazio tipado basta, mesmo padrao de
 * `ai/compositionRoot.test.ts`/`conversations/compositionRoot.test.ts`.
 */
describe('createAnalyticsComposition (Milestone 4, Bloco M4C)', () => {
  it('monta service, router e error handler sem lancar, dado um PrismaClient', () => {
    const fakePrisma = {} as unknown as PrismaClient;

    const composition = createAnalyticsComposition(fakePrisma, new NoopLogger());

    expect(composition.analyticsService).toBeInstanceOf(AnalyticsService);
    expect(typeof composition.analyticsRouter).toBe('function');
    expect(typeof composition.analyticsErrorHandler).toBe('function');
    expect(composition.analyticsRepository).toBeDefined();
  });
});
