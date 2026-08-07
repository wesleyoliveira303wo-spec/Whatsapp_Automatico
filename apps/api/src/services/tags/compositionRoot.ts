import type { PrismaClient } from '@prisma/client';
import type { Router, ErrorRequestHandler } from 'express';

import { Logger } from '../../shared/domain/Logger';
import { PrismaTenantRepository } from '../../shared/tenant/infrastructure/PrismaTenantRepository';
import { PrismaTagRepository } from './infrastructure/repositories/PrismaTagRepository';
import { TagRepository } from './domain/repositories/TagRepository';
import { TagService } from './application/TagService';
import { createTagRouter } from './presentation/tagRouter';
import { createConversationTagRouter } from './presentation/conversationTagRouter';
import { createTagErrorHandler } from './presentation/tagErrorHandler';

/**
 * Composition root do bounded context `tags` (Redesign 2026-08-05, R4).
 * Responsabilidade única: instanciar `PrismaTagRepository` (Infrastructure),
 * o `TagService` (Application) e montar os DOIS routers + error handler
 * (Presentation) — catálogo (`tagRouter`, por sessão) e atribuição
 * (`conversationTagRouter`, por conversa), ambos sobre o MESMO service.
 * Nenhuma regra de negócio, nenhum SQL.
 *
 * Não recebe conexão Redis/BullMQ: tags são um CRUD autocontido sobre
 * Postgres, sem fila — mesmo racional de `createQuickRepliesComposition`,
 * por isso é montado nos DOIS ramos de `mountWhatsAppSessionsRoutes()` em
 * `index.ts` (degradado sem Redis, e completo).
 */
export interface TagsComposition {
  tagRepository: TagRepository;
  tagService: TagService;
  tagRouter: Router;
  conversationTagRouter: Router;
  tagErrorHandler: ErrorRequestHandler;
}

export function createTagsComposition(prisma: PrismaClient, logger: Logger): TagsComposition {
  const tagRepository = new PrismaTagRepository(prisma);
  const tenantRepository = new PrismaTenantRepository(prisma);

  const tagService = new TagService(tagRepository, tenantRepository, logger);

  const tagRouter = createTagRouter(tagService);
  const conversationTagRouter = createConversationTagRouter(tagService);
  const tagErrorHandler = createTagErrorHandler(logger);

  return { tagRepository, tagService, tagRouter, conversationTagRouter, tagErrorHandler };
}
