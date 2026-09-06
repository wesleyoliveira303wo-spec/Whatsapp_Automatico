import { randomBytes } from 'crypto';

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
import { createPlatformTenantsRouter } from './presentation/platformTenantsRouter';
import { createPlatformOverviewRouter } from './presentation/platformOverviewRouter';
import { createPlatformErrorHandler } from './presentation/platformErrorHandler';
import { createRequirePlatformUser } from './presentation/requirePlatformUser';
import { PrismaTenantObservabilityRepository } from './infrastructure/repositories/PrismaTenantObservabilityRepository';
import { TenantObservabilityService } from './application/TenantObservabilityService';
import { PlatformOverviewService } from './application/PlatformOverviewService';
import { PlatformHealthService } from './application/PlatformHealthService';
import { PrismaTenantRepository } from '../../shared/tenant/infrastructure/PrismaTenantRepository';
import { TenantControlService } from './application/TenantControlService';
import { PrismaAuditLogRepository } from '../auth/infrastructure/repositories/PrismaAuditLogRepository';
import { PrismaSupportAccessRepository } from './infrastructure/repositories/PrismaSupportAccessRepository';
import { Hs256SupportAccessTokenService } from './infrastructure/Hs256SupportAccessTokenService';
import { SupportAccessService } from './application/SupportAccessService';
import { SupportAccessTokenService } from './domain/SupportAccessTokenService';
import { SupportAccessVerifier } from './domain/providers/SupportAccessVerifier';
import { createPlatformSupportRouter } from './presentation/platformSupportRouter';
import { createTenantSupportAccessRouter } from './presentation/tenantSupportAccessRouter';
import { createSupportAccessAuditMiddleware } from './presentation/supportAccessAuditMiddleware';
import { createSupportAccessErrorHandler } from './presentation/supportAccessErrorHandler';

/** Sessão do `/admin`: 8 horas (§4 do plano mestre). */
export const DEFAULT_PLATFORM_SESSION_TTL_SECONDS = 8 * 60 * 60;

/** Janela de acesso assistido: 2 horas (§9.1 passo 3). */
export const DEFAULT_SUPPORT_ACCESS_TTL_SECONDS = 2 * 60 * 60;

export interface PlatformConfig {
  /**
   * Segredo do crachá de plataforma. DEVE ser diferente do
   * `accessTokenSecret` do tenant — é o que impede um crachá de um lado de
   * ser aceito no outro caso os formatos venham a convergir.
   */
  sessionSecret: string;
  sessionTtlSeconds?: number;
  /**
   * Fase 5 — segredo do crachá de ACESSO ASSISTIDO. DEVE ser distinto de
   * `sessionSecret` e do `accessTokenSecret` do tenant (o `index.ts` recusa
   * subir se colidir). Ausente → o plano `support` do `authenticate` fica
   * desligado e o admin não consegue "entrar" em conta nenhuma.
   */
  supportAccessTokenSecret?: string;
  supportAccessTokenTtlSeconds?: number;
}

export interface PlatformComposition {
  platformRouter: Router;
  /**
   * Centro de Tenants — Fase 2. Router SEPARADO, montado no mesmo prefixo
   * `/api/platform` e atrás do MESMO `requirePlatformUser`. Campo aditivo:
   * consumidores da Fase 1 não mudam.
   */
  platformTenantsRouter: Router;
  /** Início + Saúde — Fase 3. Mesmo prefixo, mesmo porteiro. Campo aditivo. */
  platformOverviewRouter: Router;
  /** Controle do tenant — Fase 4. Exposto para teste. Campo aditivo. */
  tenantControlService: TenantControlService;
  /** Suporte assistido — Fase 5. Lado ADMIN (`/api/platform/support/*`). */
  platformSupportRouter: Router;
  /** Suporte assistido — Fase 5. Lado TENANT (`/api/tenants/:tenantId/support-access/*`). */
  tenantSupportAccessRouter: Router;
  /** Fase 5 — grava as ações de suporte no `AuditLog` do tenant. Montado após `authenticate`. */
  supportAccessAuditMiddleware: RequestHandler;
  /** Fase 5 — error handler das rotas tenant-scoped de suporte. */
  supportAccessErrorHandler: ErrorRequestHandler;
  /** Fase 5 — consumido pelo `authenticate` para revalidar o acesso no banco. */
  supportAccessVerifier: SupportAccessVerifier;
  /** Fase 5 — consumido pelo `authenticate` para verificar o crachá de suporte. */
  supportAccessTokenService: SupportAccessTokenService;
  /** Fase 5 — exposto para teste. */
  supportAccessService: SupportAccessService;
  platformErrorHandler: ErrorRequestHandler;
  platformAuthService: PlatformAuthService;
  platformUserRepository: PlatformUserRepository;
  /** Fase 2 — exposto para teste e para as fases seguintes. Fase 3 injeta o resolvedor ao vivo aqui. */
  tenantObservabilityService: TenantObservabilityService;
  /** Fase 3 — exposto para o `index.ts` injetar o `PlatformHealthProbe`. */
  platformHealthService: PlatformHealthService;
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

  // Fase 2 — Centro de Tenants. Leitura cross-tenant, sem Redis, sem migration
  // (§ Fase 2, risco 🟢). O `TenantObservabilityService` recebe o relógio real;
  // testes injetam um fixo.
  const observabilityRepository = new PrismaTenantObservabilityRepository(prisma);
  const tenantObservabilityService = new TenantObservabilityService(observabilityRepository);

  // Fase 3 — Início e Saúde. Reusam a mesma lista de tenants (com sinais e
  // status reconciliado); só somam os KPIs globais e a Fila de ação. O
  // resolvedor ao vivo (ADR #80) e o probe de infra são injetados por
  // `index.ts` (D15 — dependem de coisas que só existem lá).
  const platformOverviewService = new PlatformOverviewService(
    tenantObservabilityService,
    observabilityRepository,
  );
  const platformHealthService = new PlatformHealthService(
    tenantObservabilityService,
    observabilityRepository,
  );

  // Fase 4 — Controle. PRIMEIRA escrita cross-tenant. `TenantRepository` é a
  // mesma porta só-leitura do resto do projeto, agora com `changePlan`/
  // `setStatus`; a orquestração (auditar ANTES de escrever) fica no service.
  const tenantControlService = new TenantControlService(
    new PrismaTenantRepository(prisma),
    auditLogRepository,
    logger,
  );

  // Fase 5 — Suporte assistido. O `SupportAccessRepository` também implementa
  // o `SupportAccessVerifier` (uma leitura só do `TenantAccessRequest`). A
  // trilha do TENANT (`PrismaAuditLogRepository`) entra aqui além da de
  // plataforma — o cliente vê as ações de suporte na Auditoria dele.
  const supportAccessRepository = new PrismaSupportAccessRepository(prisma);
  const tenantAuditLogRepository = new PrismaAuditLogRepository(prisma);
  // Sem `SUPPORT_ACCESS_TOKEN_SECRET` configurado: um segredo EFÊMERO por
  // processo. O ciclo 5a (pedir/autorizar/revogar) funciona; o `index.ts` só
  // liga o plano `support` do `authenticate` quando o segredo vem do ambiente,
  // então um crachá assinado com este segredo efêmero nunca é aceito — "Entrar
  // na conta" falha limpo com `support_access_unavailable`.
  const supportAccessTokenService = new Hs256SupportAccessTokenService(
    config.supportAccessTokenSecret ?? randomBytes(32).toString('base64'),
    config.supportAccessTokenTtlSeconds ?? DEFAULT_SUPPORT_ACCESS_TTL_SECONDS,
  );
  const supportAccessService = new SupportAccessService(
    supportAccessRepository,
    auditLogRepository,
    tenantAuditLogRepository,
    supportAccessTokenService,
    platformUserRepository,
    logger,
  );

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
    platformTenantsRouter: createPlatformTenantsRouter(
      tenantObservabilityService,
      requirePlatformUser,
      tenantControlService,
    ),
    platformOverviewRouter: createPlatformOverviewRouter(
      platformOverviewService,
      platformHealthService,
      requirePlatformUser,
    ),
    platformSupportRouter: createPlatformSupportRouter(supportAccessService, requirePlatformUser),
    tenantSupportAccessRouter: createTenantSupportAccessRouter(supportAccessService),
    supportAccessAuditMiddleware: createSupportAccessAuditMiddleware(
      tenantAuditLogRepository,
      logger,
    ),
    supportAccessErrorHandler: createSupportAccessErrorHandler(logger),
    supportAccessVerifier: supportAccessRepository,
    supportAccessTokenService,
    supportAccessService,
    platformErrorHandler: createPlatformErrorHandler(logger),
    platformAuthService,
    platformUserRepository,
    tenantObservabilityService,
    platformHealthService,
    tenantControlService,
    requirePlatformUser,
  };
}
