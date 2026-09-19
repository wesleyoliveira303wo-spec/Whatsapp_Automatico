import type { PrismaClient } from '@prisma/client';
import type { ErrorRequestHandler, Router } from 'express';
import Stripe from 'stripe';

import { Logger } from '../../shared/domain/Logger';
import { TenantRepository } from '../../shared/tenant/domain/TenantRepository';
import { PrismaAuditLogRepository } from '../auth/infrastructure/repositories/PrismaAuditLogRepository';
import { ActiveSubscriptionChecker } from '../platform/domain/providers/ActiveSubscriptionChecker';
import { BillingGateway } from './domain/BillingGateway';
import { BillingService } from './application/BillingService';
import { PlanChangeService } from './application/PlanChangeService';
import { readBillingEnv } from './infrastructure/billingConfig';
import { PrismaBillingEventRepository } from './infrastructure/PrismaBillingEventRepository';
import { PrismaSubscriptionRepository } from './infrastructure/PrismaSubscriptionRepository';
import { SubscriptionRepository } from './domain/repositories/SubscriptionRepository';
import { StripeBillingGateway } from './infrastructure/StripeBillingGateway';
import { SubscriptionActiveChecker } from './infrastructure/SubscriptionActiveChecker';
import { createBillingErrorHandler } from './presentation/billingErrorHandler';
import { createBillingRouter } from './presentation/billingRouter';
import { createBillingWebhookRouter } from './presentation/billingWebhookRouter';

export interface BillingComposition {
  billingService: BillingService;
  billingRouter: Router;
  billingErrorHandler: ErrorRequestHandler;
  /** Ausente com a cobrança desligada — sem segredo, não há como conferir aviso nenhum. */
  billingWebhookRouter?: Router;
  activeSubscriptionChecker: ActiveSubscriptionChecker;
  /**
   * B5, etapa 3 — a rotina de descida de plano (sessões/campanhas/disparos),
   * já injetada em `billingService`/`TenantControlService` (`/admin`). Exposta
   * aqui para `index.ts` injetar as três portas de descida (`services/whatsapp`/
   * `campaigns`/`groupBroadcasts`) depois que cada um deles existir.
   */
  planChangeService: PlanChangeService;
  /** Exposto para `index.ts` montar o `BillingGraceJobProcessor` (fila `billing-grace`). */
  subscriptionRepository: SubscriptionRepository;
  /** Ausente com a cobrança desligada. */
  gateway?: BillingGateway;
}

/**
 * Monta a cobrança (B5, etapa 2). Com a configuração incompleta, o módulo
 * sobe DESLIGADO: a aba Plano mostra o plano e "em breve", as rotas de
 * assinar respondem 503 e o webhook não existe — o resto da API segue igual
 * (mesma degradação graciosa das outras peças opcionais).
 */
export function createBillingComposition(
  prisma: PrismaClient,
  logger: Logger,
  tenantRepository: TenantRepository,
  env: NodeJS.ProcessEnv = process.env,
): BillingComposition {
  const subscriptions = new PrismaSubscriptionRepository(prisma);
  const events = new PrismaBillingEventRepository(prisma);
  const config = readBillingEnv(env);

  if (!config.enabled) {
    logger.warn('Cobrança pelo Stripe desligada: faltam variáveis de ambiente', {
      missing: config.missing,
    });
  }

  const gateway: BillingGateway | undefined = config.enabled
    ? new StripeBillingGateway(new Stripe(config.secretKey), config.webhookSecret)
    : undefined;
  const auditLogRepository = new PrismaAuditLogRepository(prisma);
  const planChangeService = new PlanChangeService(logger, auditLogRepository);

  const billingService = new BillingService(
    subscriptions,
    events,
    tenantRepository,
    logger,
    config.enabled
      ? { gateway: gateway!, catalog: config.catalog, publicUrl: config.publicUrl }
      : undefined,
    auditLogRepository,
    () => new Date(),
    planChangeService,
  );

  return {
    billingService,
    billingRouter: createBillingRouter(billingService),
    billingErrorHandler: createBillingErrorHandler(logger),
    billingWebhookRouter: config.enabled
      ? createBillingWebhookRouter(billingService, logger)
      : undefined,
    activeSubscriptionChecker: new SubscriptionActiveChecker(subscriptions),
    planChangeService,
    subscriptionRepository: subscriptions,
    gateway,
  };
}
