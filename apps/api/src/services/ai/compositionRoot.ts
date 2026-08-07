import { PrismaClient } from '@prisma/client';

import { Logger } from '../../shared/domain/Logger';
import { PrismaTenantRepository } from '../../shared/tenant/infrastructure/PrismaTenantRepository';
import { PrismaAiInteractionRepository } from './infrastructure/repositories/PrismaAiInteractionRepository';
import { PrismaAiBusinessProfileRepository } from './infrastructure/repositories/PrismaAiBusinessProfileRepository';
import { AiInteractionRepository } from './domain/repositories/AiInteractionRepository';
import { AiBusinessProfileRepository } from './domain/repositories/AiBusinessProfileRepository';
import { AiInteractionsService } from './application/AiInteractionsService';
import { AiBusinessProfileService } from './application/AiBusinessProfileService';

/**
 * Composition root do bounded context `ai` (Presentation, Milestone 3, Bloco
 * 5 — D6/D15/D16 do levantamento arquitetural). Único lugar do código de
 * produção que conhece simultaneamente `PrismaAiInteractionRepository`
 * (Infrastructure) e o Application Service que a Presentation deste bounded
 * context consome (`aiInteractionsRouter`, D16 — mantido separado do router
 * de `conversations` porque `AiInteraction` pertence a este bounded
 * context, não àquele).
 *
 * Não recebe nenhuma conexão Redis/BullMQ: `ai` não produz nem consome
 * nenhuma fila diretamente neste bloco — quem consome `ai-reply` é
 * `worker.ts` (Bloco 4), e este composition root só serve a leitura REST de
 * auditoria/billing (`GET .../ai-interactions`).
 */
export interface AiComposition {
  aiInteractionRepository: AiInteractionRepository;
  aiInteractionsService: AiInteractionsService;
  // Base de Conhecimento (Nível 1) — aditivo. O repositório também é usado
  // pelo `worker.ts` (para injetar o perfil no prompt), mas lá é construído
  // diretamente; aqui serve a leitura/escrita REST via `aiBusinessProfileService`.
  aiBusinessProfileRepository: AiBusinessProfileRepository;
  aiBusinessProfileService: AiBusinessProfileService;
}

export function createAiComposition(prisma: PrismaClient, logger: Logger): AiComposition {
  const aiInteractionRepository = new PrismaAiInteractionRepository(prisma);
  const aiBusinessProfileRepository = new PrismaAiBusinessProfileRepository(prisma);
  const tenantRepository = new PrismaTenantRepository(prisma);

  const aiInteractionsService = new AiInteractionsService(
    aiInteractionRepository,
    tenantRepository,
    logger,
  );
  const aiBusinessProfileService = new AiBusinessProfileService(
    aiBusinessProfileRepository,
    tenantRepository,
    logger,
  );

  return {
    aiInteractionRepository,
    aiInteractionsService,
    aiBusinessProfileRepository,
    aiBusinessProfileService,
  };
}
