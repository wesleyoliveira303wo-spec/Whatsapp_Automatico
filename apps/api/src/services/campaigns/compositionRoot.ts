import type { PrismaClient } from '@prisma/client';
import type { Router, ErrorRequestHandler } from 'express';

import { Logger } from '../../shared/domain/Logger';
import { PrismaTenantRepository } from '../../shared/tenant/infrastructure/PrismaTenantRepository';
import { PrismaCampaignRepository } from './infrastructure/repositories/PrismaCampaignRepository';
import { CampaignRepository } from './domain/repositories/CampaignRepository';
import { CampaignService } from './application/CampaignService';
import { createCampaignsRouter } from './presentation/campaignsRouter';
import { createCampaignsErrorHandler } from './presentation/campaignsErrorHandler';

/**
 * Composition root do bounded context `campaigns` (Fase L, Bloco L3).
 * Mesmo racional de `createContactsComposition`/`createTagsComposition`: CRUD
 * autocontido sobre Postgres, sem Redis/fila (o L3 não envia nada), então
 * montado nos DOIS ramos de `mountWhatsAppSessionsRoutes()` em `index.ts`.
 */
export interface CampaignsComposition {
  campaignRepository: CampaignRepository;
  campaignService: CampaignService;
  campaignsRouter: Router;
  campaignsErrorHandler: ErrorRequestHandler;
}

export function createCampaignsComposition(
  prisma: PrismaClient,
  logger: Logger,
): CampaignsComposition {
  const campaignRepository = new PrismaCampaignRepository(prisma);
  const tenantRepository = new PrismaTenantRepository(prisma);

  const campaignService = new CampaignService(campaignRepository, tenantRepository, logger);
  const campaignsRouter = createCampaignsRouter(campaignService);
  const campaignsErrorHandler = createCampaignsErrorHandler(logger);

  return { campaignRepository, campaignService, campaignsRouter, campaignsErrorHandler };
}
