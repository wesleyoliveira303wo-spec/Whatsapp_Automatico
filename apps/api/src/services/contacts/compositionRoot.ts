import type { PrismaClient } from '@prisma/client';
import type { Router, ErrorRequestHandler } from 'express';

import { Logger } from '../../shared/domain/Logger';
import { PrismaTenantRepository } from '../../shared/tenant/infrastructure/PrismaTenantRepository';
import { PrismaContactRepository } from './infrastructure/repositories/PrismaContactRepository';
import { ContactRepository } from './domain/repositories/ContactRepository';
import { ContactImportService } from './application/ContactImportService';
import { createContactsRouter } from './presentation/contactsRouter';
import { createContactsErrorHandler } from './presentation/contactsErrorHandler';

/**
 * Composition root do bounded context `contacts` (Fase L, Blocos L1/L1b).
 * Instancia `PrismaContactRepository` (Infrastructure), o
 * `ContactImportService` (Application) e monta o router + error handler
 * (Presentation). Nenhuma regra de negócio, nenhum SQL.
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
  contactsRouter: Router;
  contactsErrorHandler: ErrorRequestHandler;
}

export function createContactsComposition(
  prisma: PrismaClient,
  logger: Logger,
): ContactsComposition {
  const contactRepository = new PrismaContactRepository(prisma);
  const tenantRepository = new PrismaTenantRepository(prisma);

  const contactImportService = new ContactImportService(
    contactRepository,
    tenantRepository,
    logger,
  );

  const contactsRouter = createContactsRouter(contactRepository, contactImportService);
  const contactsErrorHandler = createContactsErrorHandler(logger);

  return { contactRepository, contactImportService, contactsRouter, contactsErrorHandler };
}
