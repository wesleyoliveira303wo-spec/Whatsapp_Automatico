import { PrismaClient } from '@prisma/client';
import { createAuthComposition } from '../../../src/services/auth/compositionRoot';
import { AuthService } from '../../../src/services/auth/application/AuthService';
import { UserManagementService } from '../../../src/services/auth/application/UserManagementService';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';

describe('createAuthComposition (Milestone 5, Bloco M5C)', () => {
  it('monta service, router, error handler e requireUser sem lancar, dado config valida', () => {
    const fakePrisma = {} as unknown as PrismaClient;

    const composition = createAuthComposition(
      fakePrisma,
      { accessTokenSecret: 'segredo-bem-comprido-de-teste-123456', accessTokenTtlSeconds: 900, refreshTokenTtlMs: 604800000 },
      new NoopLogger(),
    );

    expect(composition.authService).toBeInstanceOf(AuthService);
    expect(typeof composition.authRouter).toBe('function');
    expect(typeof composition.authErrorHandler).toBe('function');
    expect(typeof composition.requireUser).toBe('function');
    // Milestone 5, Bloco M5E — o "RH" sai da MESMA composition (aditivo).
    expect(composition.userManagementService).toBeInstanceOf(UserManagementService);
    expect(typeof composition.usersRouter).toBe('function');
    expect(typeof composition.usersErrorHandler).toBe('function');
  });

  it('propaga o erro de secret vazio (Hs256AccessTokenService recusa)', () => {
    const fakePrisma = {} as unknown as PrismaClient;
    expect(() =>
      createAuthComposition(fakePrisma, { accessTokenSecret: '', accessTokenTtlSeconds: 900, refreshTokenTtlMs: 1 }, new NoopLogger()),
    ).toThrow();
  });
});
