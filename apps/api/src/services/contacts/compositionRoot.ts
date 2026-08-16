import type { PrismaClient } from '@prisma/client';
import type { Router, ErrorRequestHandler } from 'express';

import { Logger } from '../../shared/domain/Logger';
import { PrismaTenantRepository } from '../../shared/tenant/infrastructure/PrismaTenantRepository';
import { PrismaContactRepository } from './infrastructure/repositories/PrismaContactRepository';
import { PrismaConsentEventRepository } from './infrastructure/repositories/PrismaConsentEventRepository';
import { ContactRepository } from './domain/repositories/ContactRepository';
import { ContactImportService } from './application/ContactImportService';
import { ContactConsentService } from './application/ContactConsentService';
import { createContactsRouter } from './presentation/contactsRouter';
import { createContactsErrorHandler } from './presentation/contactsErrorHandler';

/**
 * Composition root do bounded context `contacts` (Fase L, Blocos L1/L1b/L2).
 * Instancia os repositórios Prisma (Infrastructure), os Application Services
 * e monta o router + error handler (Presentation). Nenhuma regra de
 * negócio, nenhum SQL.
 *
 * Não recebe conexão Redis/BullMQ: contatos são um CRUD autocontido sobre
 * Postgres, sem fila — mesmo racional de `createTagsComposition`/
 * `createQuickRepliesComposition`, por isso é montado nos DOIS ramos de
 * `mountWhatsAppSessionsRoutes()` em `index.ts` (degradado sem Redis, e
 * completo).
 */
export interface ContactsComposition {
  contactRepository: ContactRepository;
  contactImportService: ContactImportService;
  contactConsentService: ContactConsentService;
  contactsRouter: Router;
  contactsErrorHandler: ErrorRequestHandler;
}

export function createContactsComposition(
  prisma: PrismaClient,
  logger: Logger,
): ContactsComposition {
  const contactRepository = new PrismaContactRepository(prisma);
  const consentEventRepository = new PrismaConsentEventRepository(prisma);
  const tenantRepository = new PrismaTenantRepository(prisma);

  const contactImportService = new ContactImportService(
    contactRepository,
    tenantRepository,
    logger,
  );
  const contactConsentService = new ContactConsentService(
    contactRepository,
    consentEventRepository,
    tenantRepository,
    logger,
  );

  const contactsRouter = createContactsRouter(
    contactRepository,
    contactImportService,
    contactConsentService,
  );
  const contactsErrorHandler = createContactsErrorHandler(logger);

  return {
    contactRepository,
    contactImportService,
    contactConsentService,
    contactsRouter,
    contactsErrorHandler,
  };
}
