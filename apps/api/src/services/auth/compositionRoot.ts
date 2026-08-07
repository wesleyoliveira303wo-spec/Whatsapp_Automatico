import type { PrismaClient } from '@prisma/client';
import type { Router, ErrorRequestHandler, RequestHandler } from 'express';

import { Logger } from '../../shared/domain/Logger';
import { createRequireUser } from '../../shared/presentation/requireUser';
import { createRateLimiter } from '../../shared/presentation/rateLimit';
import { AccessTokenService } from './domain/AccessTokenService';
import { PrismaUserRepository } from './infrastructure/repositories/PrismaUserRepository';
import { PrismaRefreshTokenRepository } from './infrastructure/repositories/PrismaRefreshTokenRepository';
import { PrismaAuditLogRepository } from './infrastructure/repositories/PrismaAuditLogRepository';
import { ScryptPasswordHasher } from './infrastructure/ScryptPasswordHasher';
import { Hs256AccessTokenService } from './infrastructure/Hs256AccessTokenService';
import { Sha256RefreshTokenCodec } from './infrastructure/Sha256RefreshTokenCodec';
import { RefreshTokenService } from './application/RefreshTokenService';
import { AuthService } from './application/AuthService';
import { UserManagementService } from './application/UserManagementService';
import { AuditLogService } from './application/AuditLogService';
import { createAuthRouter } from './presentation/authRouter';
import { createAuthErrorHandler } from './presentation/authErrorHandler';
import { createUsersRouter } from './presentation/usersRouter';
import { createUsersErrorHandler } from './presentation/usersErrorHandler';
import { createAuditLogRouter } from './presentation/auditLogRouter';

/** Config de auth vinda do ambiente (segredo do cracha + validades). Resolvida em `index.ts`. */
export interface AuthConfig {
  accessTokenSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlMs: number;
}

/**
 * Composition root do bounded context `auth` (Milestone 5, Bloco M5C — D63).
 * Monta toda a cadeia (repositorios Prisma, hash de senha, cracha, cartao de
 * ponto, AuthService, router, error handler) e tambem devolve o `requireUser`
 * ja construido sobre o MESMO `AccessTokenService` — para que, no M5D, as rotas
 * de outros bounded contexts reusem exatamente o mesmo verificador de cracha.
 *
 * Nao depende de Redis/BullMQ (auth e so HTTP + Postgres).
 */
export interface AuthComposition {
  authService: AuthService;
  authRouter: Router;
  authErrorHandler: ErrorRequestHandler;
  requireUser: RequestHandler;
  /** Exposto para o `index.ts` construir o `authenticate` (porteiro dois-planos, M5D) reusando a MESMA instancia — nao um segundo verificador. */
  accessTokenService: AccessTokenService;
  /** Gestao de usuarios (o "RH") — Milestone 5, Bloco M5E. Campos ADITIVOS: consumidores anteriores da composition nao mudam. */
  userManagementService: UserManagementService;
  usersRouter: Router;
  usersErrorHandler: ErrorRequestHandler;
  /** Painel de auditoria (Fase 1, Bloco F1.5). Campo ADITIVO. */
  auditLogService: AuditLogService;
  auditLogRouter: Router;
}

export function createAuthComposition(
  prisma: PrismaClient,
  config: AuthConfig,
  logger: Logger,
): AuthComposition {
  const userRepository = new PrismaUserRepository(prisma);
  const refreshTokenRepository = new PrismaRefreshTokenRepository(prisma);
  const auditLogRepository = new PrismaAuditLogRepository(prisma);

  const passwordHasher = new ScryptPasswordHasher();
  const accessTokenService = new Hs256AccessTokenService(
    config.accessTokenSecret,
    config.accessTokenTtlSeconds,
  );
  const refreshTokenService = new RefreshTokenService(
    refreshTokenRepository,
    new Sha256RefreshTokenCodec(),
    config.refreshTokenTtlMs,
  );

  const authService = new AuthService(
    userRepository,
    passwordHasher,
    accessTokenService,
    refreshTokenService,
    auditLogRepository,
    logger,
  );

  const requireUser = createRequireUser(accessTokenService);
  // Milestone 5, Bloco M5H — freio anti-forca-bruta nas rotas pre-autenticacao
  // (login/refresh): 20 tentativas por IP a cada 15 minutos. Em memoria, por
  // processo — suficiente para instancia unica; Redis-backed fica como
  // evolucao futura (ver docstring de `createRateLimiter`).
  const loginRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
  const authRouter = createAuthRouter(authService, requireUser, loginRateLimiter);
  const authErrorHandler = createAuthErrorHandler(logger);

  // Milestone 5, Bloco M5E — o "RH" reusa os MESMOS repositorios/hasher do
  // login (uma instancia de cada por composition; nada duplicado).
  const userManagementService = new UserManagementService(
    userRepository,
    refreshTokenRepository,
    auditLogRepository,
    passwordHasher,
    logger,
  );
  const usersRouter = createUsersRouter(userManagementService);
  const usersErrorHandler = createUsersErrorHandler(logger);

  // Fase 1, Bloco F1.5 — reusa a MESMA instância de `auditLogRepository` já
  // usada por `authService`/`userManagementService` (nada duplicado).
  const auditLogService = new AuditLogService(auditLogRepository);
  const auditLogRouter = createAuditLogRouter(auditLogService);

  return {
    authService,
    authRouter,
    authErrorHandler,
    requireUser,
    accessTokenService,
    userManagementService,
    usersRouter,
    usersErrorHandler,
    auditLogService,
    auditLogRouter,
  };
}
