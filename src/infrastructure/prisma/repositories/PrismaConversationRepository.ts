import { prisma } from '../PrismaClient';
import { Conversation } from '../../../domain/entities/Conversation';
import { ConversationRepository } from '../../../domain/repositories/ConversationRepository';
import { ConversationStatus } from '../../../domain/enums/ConversationStatus';
import { logger } from '../../logger';

// Mapper helpers (Prisma <-> Domain)
function toDomain(prismaModel: Record<string, unknown>): Conversation {
  return new Conversation({
    id: prismaModel.id,
    tenantId: prismaModel.tenantId,
    contactId: prismaModel.contactId,
    status: prismaModel.status as ConversationStatus,
    assignedTo: prismaModel.assignedTo ?? undefined,
    leadId: prismaModel.leadId ?? undefined,
    openedAt: prismaModel.openedAt ?? undefined,
    closedAt: prismaModel.closedAt ?? undefined,
    createdAt: prismaModel.createdAt,
    updatedAt: prismaModel.updatedAt,
  });
}

function toPrisma(entity: Conversation): Record<string, unknown> {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    contactId: entity.contactId,
    status: entity.status,
    assignedTo: entity.assignedTo ?? null,
    leadId: entity.leadId ?? null,
    openedAt: entity.openedAt ?? null,
    closedAt: entity.closedAt ?? null,
    // createdAt/updatedAt handled by Prisma defaults
  };
}

export class PrismaConversationRepository implements ConversationRepository {
  async findById(id: string): Promise<Conversation | null> {
    try {
      const model = await prisma.conversation.findUnique({ where: { id } });
      return model ? toDomain(model) : null;
    } catch (error) {
      logger.error('Error finding Conversation by id', { id, error });
      throw error; // propagate – Application will map to its own error if needed
    }
  }

  async findByContactId(tenantId: string, contactId: string): Promise<Conversation | null> {
    try {
      const model = await prisma.conversation.findFirst({
        where: { tenantId, contactId },
      });
      return model ? toDomain(model) : null;
    } catch (error) {
      logger.error('Error finding Conversation by contact', { tenantId, contactId, error });
      throw error;
    }
  }

  async save(conversation: Conversation): Promise<void> {
    try {
      const data = toPrisma(conversation);
      await prisma.conversation.upsert({
        where: { id: conversation.id },
        create: data,
        update: data,
      });
    } catch (error) {
      logger.error('Error saving Conversation', { id: conversation.id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.conversation.delete({ where: { id } });
    } catch (error) {
      logger.error('Error deleting Conversation', { id, error });
      // Prisma throws if not found – treat as idempotent delete
      // swallow if error code indicates record not found
      // Prisma error code for record not found is P2025
      if ((error as { code?: string } | null)?.code === 'P2025') return;
      throw error;
    }
  }
}
