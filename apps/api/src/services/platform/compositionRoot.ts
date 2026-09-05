import type { PrismaClient } from '@prisma/client';
import type { Router, ErrorRequestHandler, RequestHandler } from 'express';

import { Logger } from '../../shared/domain/Logger';
import { RateLimitStore } from '../../shared/domain/RateLimitStore';
import { InMemoryRateLimitStore } from '../../shared/infrastructure/rateLimit/InMemoryRateLimitStore';
import { createRateLimiter } from '../../shared/presentation/rateLimit';
import { ScryptPasswordHasher } from '../auth/infrastructure/ScryptPasswordHasher';
import { RateLimitStoreAccountLockout } from '../auth/infrastructure/RateLimitStoreAccountLockout';
import { PlatformAuthService } from './application/PlatformAuthService';
import { PlatformUserRepository } from './domain/repositories/PlatformUserRepository';
import { PrismaPlatformUserRepository } from './infrastructure/repositories/PrismaPlatformUserRepository';
import { PrismaPlatformAuditLogRepository } from './infrastructure/repositories/PrismaPlatformAuditLogRepository';
import { Hs256PlatformSessionTokenService } from './infrastructure/Hs256PlatformSessionTokenService';
import { createPlatformRouter } from './presentation/platformRouter';
import { createPlatformErrorHandler } from './presentation/platformErrorHandler';
import { createRequirePlatformUser } from './presentation/requirePlatformUser';

/** Sessão do `/admin`: 8 horas (§4 do plano mestre). */
export const DEFAULT_PLATFORM_SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface PlatformConfig {
  /**
   * Segredo do crachá de plataforma. DEVE ser diferente do
   * `accessTokenSecret` do tenant — é o que impede um crachá de um lado de
   * ser aceito no outro caso os formatos venham a convergir.
   */
  sessionSecret: string;
  sessionTtlSeconds?: number;
}

export interface PlatformComposition {
  platformRouter: Router;
  platformErrorHandler: ErrorRequestHandler;
  platformAuthService: PlatformAuthService;
  platformUserRepository: PlatformUserRepository;
  /**
   * Exposto para as fases seguintes montarem rotas de plataforma reusando o
   * MESMO porteiro — nunca um segundo verificador.
   */
  requirePlatformUser: RequestHandler;
}

/**
 * Composition root do bounded context `platform` — Fase 1 do `/admin`.
 *
 * Reaproveita explicitamente três peças de `services/auth` em vez de
 * reescrevê-las: o hash de senha (scrypt), a trava de conta e o
 * `RateLimitStore` por trás dela (Bloco B1). O que NÃO é reaproveitado é o
 * crachá — ali a duplicação é o ponto, não um deslize (ver
 * `Hs256PlatformSessionTokenService`).
 *
 * Não depende de Redis nem de BullMQ: sem `REDIS_URL`, o `rateLimitStore` cai
 * para memória e o `/admin` continua de pé, com a contagem por processo —
 * mesmo modo degradado já aceito em `auth` (D8).
 */
export function createPlatformComposition(
  prisma: PrismaClient,
  config: PlatformConfig,
  logger: Logger,
  rateLimitStore: RateLimitStore = new InMemoryRateLimitStore(),
): PlatformComposition {
  const platformUserRepository = new PrismaPlatformUserRepository(prisma);
  const auditLogRepository = new PrismaPlatformAuditLogRepository(prisma);

  const tokenService = new Hs256PlatformSessionTokenService(
    config.sessionSecret,
    config.sessionTtlSeconds ?? DEFAULT_PLATFORM_SESSION_TTL_SECONDS,
  );

  // Escopos PRÓPRIOS no store (`platform-login:*`, §4): as tentativas contra
  // o `/admin` nunca compartilham contagem com as do login de tenant — senão
  // um ataque a uma conta de cliente poderia trancar a porta do fundador, ou
  // o contrário.
  const accountLockout = new RateLimitStoreAccountLockout(rateLimitStore);

  const platformAuthService = new PlatformAuthService(
    platformUserRepository,
    new ScryptPasswordHasher(),
    auditLogRepository,
    logger,
    accountLockout,
  );

  const requirePlatformUser = createRequirePlatformUser(tokenService, platformAuthService);

  const byIp = createRateLimiter({
    store: rateLimitStore,
    scope: 'platform-login:ip',
    windowMs: 15 * 60 * 1000,
    max: 20,
  });
  const byIdentity = createRateLimiter({
    store: rateLimitStore,
    scope: 'platform-login:identity',
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyFn: (req) => {
      const email = (req.body as { email?: unknown } | undefined)?.email;
      return typeof email === 'string' ? email.trim().toLowerCase() : 'unknown';
    },
  });

  return {
    platformRouter: createPlatformRouter(platformAuthService, tokenService, requirePlatformUser, [
      byIp,
      byIdentity,
    ]),
    platformErrorHandler: createPlatformErrorHandler(logger),
    platformAuthService,
    platformUserRepository,
    requirePlatformUser,
  };
}
